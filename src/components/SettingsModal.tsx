import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Moon, Sun, Globe } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { Language } from '../lib/translations';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { theme, setTheme, language, setLanguage, t } = useSettings();

  const languages: { code: Language; label: string }[] = [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'it', label: 'Italiano' },
    { code: 'de', label: 'Deutsch' },
    { code: 'es', label: 'Español' },
    { code: 'ja', label: '日本語' },
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-white dark:bg-[#111111] rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden z-10"
        >
          <div className="p-6 sm:p-8">
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 bg-gray-100 hover:bg-gray-200 dark:bg-black/50 dark:hover:bg-black/80 rounded-full transition-colors text-gray-600 dark:text-gray-300 z-20"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white drop-shadow-md">
              {t('settings')}
            </h2>

            <div className="space-y-8">
              {/* Theme Settings */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <Sun className="w-4 h-4" />
                  {t('theme')}
                </h3>
                <div className="flex bg-gray-100 dark:bg-black/40 rounded-2xl p-1 border border-gray-200 dark:border-white/5">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${
                      theme === 'light' 
                        ? 'bg-white shadow-md text-orange-500 font-bold' 
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <Sun className="w-5 h-5" />
                    {t('light')}
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all ${
                      theme === 'dark' 
                        ? 'bg-[#1a1a1a] shadow-md text-neon-cyan font-bold dark:glow-cyan' 
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <Moon className="w-5 h-5" />
                    {t('dark')}
                  </button>
                </div>
              </div>

              {/* Language Settings */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <Globe className="w-4 h-4" />
                  {t('language')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {languages.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => setLanguage(l.code)}
                      className={`py-3 px-4 rounded-xl text-left transition-all border ${
                        language === l.code
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-600 dark:text-blue-400 font-bold shadow-md'
                          : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/10'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-white/10 text-center">
              <button
                onClick={onClose}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-blue-500/30"
              >
                {t('close')}
              </button>
            </div>
            
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
