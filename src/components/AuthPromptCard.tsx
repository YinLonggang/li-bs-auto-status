import React from 'react';
import PortalLoginPrompt from './PortalLoginPrompt';
import { resolvePortalUrl } from '../utils/portalUrl';

interface AuthPromptCardProps {
  loginUrl: string;
  authError?: string | null;
  onRefresh: () => void;
}

export default function AuthPromptCard({ loginUrl, authError, onRefresh }: AuthPromptCardProps) {
  return (
    <PortalLoginPrompt
      portalUrl={resolvePortalUrl()}
      loginUrl={loginUrl}
      appBadge="BS 自动状态"
      errorMessage={authError}
      onRefresh={onRefresh}
    />
  );
}
