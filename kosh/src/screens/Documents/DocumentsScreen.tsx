import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ConfirmExtractedHoldings } from './UploadFlow/ConfirmExtractedHoldings';
import { getOrchestrator } from '@/parsers/registry';
import { ParserResult, ParserSuccess } from '@/types/parser';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { typography } from '@/theme/typography';

type Stage =
  | { kind: 'idle' }
  | { kind: 'parsing' }
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

  const pickAndParse = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/pdf'],
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

    setStage({ kind: 'parsing' });
    try {
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = base64ToBytes(base64);
      const result = await getOrchestrator().parse({
        type: inputType,
        filename: file.name,
        bytes,
      });
      if (result.ok) {
        setStage({ kind: 'review', result, filename: file.name });
      } else {
        setStage({ kind: 'error', result, filename: file.name });
      }
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
        filename: file.name,
      });
    }
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

  return (
    <Screen>
      <Text style={styles.h1}>Documents</Text>
      <Text style={styles.sub}>Upload a Zerodha Holdings or Groww Mutual Funds export.</Text>

      <View style={styles.tipBox}>
        <Text style={styles.tipH}>Supported formats</Text>
        <Tip text="Zerodha Console → Holdings → Download (XLSX)" />
        <Tip text="Groww → Profile → Mutual Funds report (XLSX)" />
      </View>

      <PrimaryButton title="Upload file" onPress={pickAndParse} disabled={stage.kind === 'parsing'} />

      {stage.kind === 'parsing' ? (
        <View style={styles.parsing}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.parsingTxt}>Parsing…</Text>
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
  // RN doesn't have global atob in some setups; do a manual decode.
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
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  tipH: { color: colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 7 },
  tipTxt: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  parsing: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.lg },
  parsingTxt: { color: colors.textSecondary },
  errBox: {
    backgroundColor: '#3A1818',
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
});
