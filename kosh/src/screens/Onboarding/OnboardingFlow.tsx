import React, { useState } from 'react';
import { WelcomeScreen } from './WelcomeScreen';
import { PassphraseScreen } from './PassphraseScreen';
import { RecoverySeedScreen } from './RecoverySeedScreen';
import { ProfileSetupScreen } from './ProfileSetupScreen';

type Step = 'welcome' | 'passphrase' | 'seed' | 'profiles';

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>('welcome');
  const [pass, setPass] = useState<string>('');

  if (step === 'welcome') {
    return <WelcomeScreen onContinue={() => setStep('passphrase')} />;
  }
  if (step === 'passphrase') {
    return (
      <PassphraseScreen
        onContinue={(p) => {
          setPass(p);
          setStep('seed');
        }}
      />
    );
  }
  if (step === 'seed') {
    return <RecoverySeedScreen onContinue={() => setStep('profiles')} />;
  }
  return <ProfileSetupScreen passphrase={pass} />;
}
