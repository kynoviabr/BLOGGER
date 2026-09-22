export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'pt-BR', name: 'Português (Brasil)', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'en-US', name: 'English (US)', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es-ES', name: 'Español', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'Français', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de-DE', name: 'Deutsch', nativeName: 'Deutsch', flag: '🇩🇪' },
];
