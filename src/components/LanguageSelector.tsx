import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const languages = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'pt', name: 'Português' },
  { code: 'de', name: 'Deutsch' }
];

const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 text-gray-300 hover:text-white transition-colors"
      >
        <Globe size={20} />
        <span>{languages.find(lang => lang.code === i18n.language)?.name || 'Language'}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
          <div className="py-1" role="menu">
            {languages.map((language) => (
              <button
                key={language.code}
                onClick={() => {
                  i18n.changeLanguage(language.code);
                  setIsOpen(false);
                }}
                className={`block w-full text-left px-4 py-2 text-sm ${
                  i18n.language === language.code
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                role="menuitem"
              >
                {language.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;