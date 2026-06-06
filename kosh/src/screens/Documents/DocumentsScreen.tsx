import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TextInput } from '@/components/TextInput';
import { ConfirmExtractedHoldings } from './UploadFlow/ConfirmExtractedHoldings';
import { getOrchestrator } from '@/parsers/registry';
import { ParserResult, ParserSuccess } from '@/types/parser';
import { extractPdfText, PdfTextError } from '@/native/pdfText';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { typography } from '@/theme/typography';

type Stage =
  | { kind: 'idle' }
  | { kind: 'parsing' }
  | { kind: 'parsing_ocr' }
  | { kind: 'awaiting_password'; uri: string; filename: string; wrongPassword: boolean }
  | { kind: 'review'; result: ParserSuccess; filename: string }
  | { kind: 'error'; result: ParserResult; filename: string };

function detectInputType(filename: string): 'csv' | 'pdf' | 'xlsx' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.pdf')) return 'pdf';
  return null;
}

export function DocumentsScreen() {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [pwInput, setPwInput] = useState('');

  const handleParse = async (
    inputType: 'csv' | 'pdf' | 'xlsx',
    uri: string,
    filename: string,
    pdfPassword?: string
  ) => {
    setStage({ kind: 'parsing' });
    try {
      let bytes: Uint8Array;
      let textPreview: string | undefined;

      if (inputType === 'pdf') {
        // First try the fast path: PDFKit `.string`. Works for most PDFs
        // including Fisdom. For chaotic layouts (CDSL CAS) the parsers
        // fall through to NO_HOLDINGS_FOUND and we retry with OCR.
        try {
          const { fullText } = await extractPdfText(uri, pdfPassword, 'fast');
          textPreview = fullText;
          bytes = new TextEncoder().encode(fullText);
        } catch (err) {
          if (err instanceof PdfTextError && err.code === 'NEEDS_PASSWORD') {
            setStage({ kind: 'awaiting_password', uri, filename, wrongPassword: false });
            return;
          }
          if (err instanceof PdfTextError && err.code === 'WRONG_PASSWORD') {
            setStage({ kind: 'awaiting_password', uri, filename, wrongPassword: true });
            return;
          }
          throw err;
        }
      } else {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        bytes = base64ToBytes(base64);
      }

      // CDSL CAS PDFs MUST go through OCR — PDFKit's `.string` reads the
      // bilingual multi-column tables in a fragmented order that the
      // parser can only partially recover (it gets bonds but silently
      // drops the mutual-fund table). Detect CAS by content sniff and
      // re-extract with OCR up front, before parsing.
      const looksLikeCas =
        inputType === 'pdf' &&
        !!textPreview &&
        /CONSOLIDATED ACCOUNT STATEMENT/i.test(textPreview);
      if (looksLikeCas) {
        setStage({ kind: 'parsing_ocr' });
        const { fullText } = await extractPdfText(uri, pdfPassword, 'ocr');
        textPreview = fullText;
        bytes = new TextEncoder().encode(fullText);
      }

      let result = await getOrchestrator().parse({
        type: inputType,
        filename,
        bytes,
        textPreview,
      });

      // Any other PDF whose fast-path parse found nothing? Retry with OCR
      // once. (Fisdom normally succeeds on the fast path; this is a safety
      // net for unexpected layouts.)
      if (
        inputType === 'pdf' &&
        !looksLikeCas &&
        !result.ok &&
        result.code === 'NO_HOLDINGS_FOUND'
      ) {
        setStage({ kind: 'parsing_ocr' });
        const { fullText } = await extractPdfText(uri, pdfPassword, 'ocr');
        textPreview = fullText;
        bytes = new TextEncoder().encode(fullText);
        result = await getOrchestrator().parse({
          type: inputType,
          filename,
          bytes,
          textPreview,
        });
      }

      if (result.ok) setStage({ kind: 'review', result, filename });
      else setStage({ kind: 'error', result, filename });
    } catch (err: any) {
      setStage({
        kind: 'error',
        result: {
          ok: false,
          parser: { name: 'orchestrator', version: '1' },
          code: 'READ_FAILED',
          message: err?.message ?? 'Failed to read file',
          warnings: [],
        },
        filename,
      });
    }
  };

  const pickAndParse = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        // Modern xlsx (Zerodha, Groww, …)
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // Legacy xls (INDmoney holdings report comes as CDFV2 binary xls)
        'application/vnd.ms-excel',
        'text/csv',
        'application/pdf',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled) return;
    const file = res.assets?.[0];
    if (!file) return;
    const inputType = detectInputType(file.name);
    if (!inputType) {
      setStage({
        kind: 'error',
        result: {
          ok: false,
          parser: { name: 'picker', version: '1' },
          code: 'UNSUPPORTED_TYPE',
          message: `Unsupported file type for ${file.name}`,
          warnings: [],
        },
        filename: file.name,
      });
      return;
    }
    setPwInput('');
    await handleParse(inputType, file.uri, file.name);
  };

  const submitPassword = async () => {
    if (stage.kind !== 'awaiting_password') return;
    const pwd = pwInput;
    setPwInput('');
    await handleParse('pdf', stage.uri, stage.filename, pwd);
  };

  if (stage.kind === 'review') {
    return (
      <ConfirmExtractedHoldings
        result={stage.result}
        filename={stage.filename}
        onSaved={() => setStage({ kind: 'idle' })}
        onCancel={() => setStage({ kind: 'idle' })}
      />
    );
  }

  if (stage.kind === 'awaiting_password') {
    return (
      <Screen>
        <Text style={styles.h1}>PDF Password</Text>
        <Text style={styles.sub}>
          {stage.filename} is encrypted. Enter the password your provider uses.
          Common defaults: PAN (uppercase), DOB (DDMMYYYY), or first 4 letters of name + DOB.
        </Text>
        <View style={{ marginTop: spacing.xl }}>
          <TextInput
            label="PDF password"
            value={pwInput}
            onChangeText={setPwInput}
            secureTextEntry
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Enter password"
            error={stage.wrongPassword ? 'Wrong password — try again.' : undefined}
            onSubmitEditing={submitPassword}
          />
          <PrimaryButton title="Unlock PDF" onPress={submitPassword} disabled={!pwInput} />
          <Pressable
            onPress={() => {
              setPwInput('');
              setStage({ kind: 'idle' });
            }}
            style={styles.cancelBtn}
          >
            <Text style={styles.cancelTxt}>Cancel</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.h1}>Upload</Text>
      <Text style={styles.sub}>
        Upload a holdings report. We detect the format, extract holdings on-device, and let
        you review before saving.
      </Text>

      <View style={styles.tipBox}>
        <Text style={styles.tipH}>Supported formats</Text>
        <Tip text="Zerodha Console → Holdings (XLSX)" />
        <Tip text="Groww → Mutual Funds report (XLSX)" />
        <Tip text="Fisdom / W by Groww PMS investor report (PDF)" />
        <Tip text="CDSL Consolidated Account Statement (PDF, password supported)" />
        <Tip text="INDmoney US Stocks → Holdings Report (XLS)" />
      </View>

      <PrimaryButton
        title="Upload file"
        onPress={pickAndParse}
        disabled={stage.kind === 'parsing' || stage.kind === 'parsing_ocr'}
      />

      {stage.kind === 'parsing' ? (
        <View style={styles.parsing}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.parsingTxt}>Parsing…</Text>
        </View>
      ) : null}

      {stage.kind === 'parsing_ocr' ? (
        <View style={styles.parsing}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.parsingTxt}>
            First pass found nothing — running OCR on each page (this can take
            10–20 seconds).
          </Text>
        </View>
      ) : null}

      {stage.kind === 'error' ? (
        <View style={styles.errBox}>
          <Text style={styles.errH}>Parse failed</Text>
          <Text style={styles.errMsg}>{stage.result.ok ? '' : stage.result.message}</Text>
          {!stage.result.ok ? (
            <Text style={styles.errCode}>Code: {stage.result.code}</Text>
          ) : null}
          <Pressable onPress={() => setStage({ kind: 'idle' })}>
            <Text style={styles.errLink}>Try another file</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <View style={styles.tipRow}>
      <View style={styles.bullet} />
      <Text style={styles.tipTxt}>{text}</Text>
    </View>
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  let bufferLength = (b64.length * 3) / 4;
  if (b64.endsWith('==')) bufferLength -= 2;
  else if (b64.endsWith('=')) bufferLength -= 1;
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const e1 = lookup[b64.charCodeAt(i)] ?? 0;
    const e2 = lookup[b64.charCodeAt(i + 1)] ?? 0;
    const e3 = lookup[b64.charCodeAt(i + 2)] ?? 0;
    const e4 = lookup[b64.charCodeAt(i + 3)] ?? 0;
    bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufferLength) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufferLength) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return bytes;
}

const styles = StyleSheet.create({
  h1: { ...typography.h1, color: colors.textPrimary },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg },
  tipBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  tipH: {
    color: colors.textSecondary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 7 },
  tipTxt: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  parsing: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.lg },
  parsingTxt: { color: colors.textSecondary },
  errBox: {
    backgroundColor: '#FEEFEF',
    borderColor: colors.negative,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: 4,
  },
  errH: { color: colors.negative, fontSize: 14, fontWeight: '700' },
  errMsg: { color: colors.textPrimary, fontSize: 13 },
  errCode: { color: colors.textMuted, fontSize: 11, fontFamily: 'Menlo' },
  errLink: { color: colors.accent, marginTop: spacing.sm, fontWeight: '500' },
  cancelBtn: { alignItems: 'center', padding: spacing.md, marginTop: spacing.sm },
  cancelTxt: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
