import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { Shield, Zap, LineChart, Server, Users, ArrowRight } from 'lucide-react';
import LanguageSelector from '../components/LanguageSelector';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [heroRef, heroInView] = useInView({ triggerOnce: true });
  const [featuresRef, featuresInView] = useInView({ triggerOnce: true });
  const [statsRef, statsInView] = useInView({ triggerOnce: true });
  const [ctaRef, ctaInView] = useInView({ triggerOnce: true });
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-indigo-900">
      <div className="absolute top-4 right-4">
        <LanguageSelector />
      </div>

      {/* Hero Section */}
      <motion.div 
        ref={heroRef}
        initial={{ opacity: 0, y: 20 }}
        animate={heroInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden"
      >
        <div className="max-w-7xl mx-auto">
          <div className="relative z-10 pb-8 sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
            <main className="mt-10 mx-auto max-w-7xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28">
              <div className="sm:text-center lg:text-left">
                <h1 className="text-4xl tracking-tight font-extrabold text-white sm:text-5xl md:text-6xl">
                  <span className="block">{t('landing.hero.title')}</span>
                  <span className="block text-indigo-400">{t('landing.hero.subtitle')}</span>
                </h1>
                <p className="mt-3 text-base text-gray-300 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                  {t('landing.hero.description')}
                </p>
                <div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start">
                  <div className="rounded-md shadow">
                    <button
                      onClick={() => navigate('/login')}
                      className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg md:px-10"
                    >
                      {t('landing.hero.cta')}
                      <ArrowRight size={20} className="ml-2" />
                    </button>
                  </div>
                  <div className="mt-3 sm:mt-0 sm:ml-3">
                    <a
                      href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL}`}
                      className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 md:py-4 md:text-lg md:px-10"
                    >
                      {t('landing.hero.contact')}
                    </a>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </motion.div>

      {/* Features Section */}
      <motion.div 
        ref={featuresRef}
        initial={{ opacity: 0 }}
        animate={featuresInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6 }}
        className="py-12 bg-gray-800 bg-opacity-50"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:text-center">
            <h2 className="text-base text-indigo-400 font-semibold tracking-wide uppercase">{t('landing.features.title')}</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-white sm:text-4xl">
              {t('landing.features.subtitle')}
            </p>
          </div>

          <div className="mt-10">
            <div className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
              {[
                { icon: Shield, key: 'monitoring' },
                { icon: Zap, key: 'power' },
                { icon: LineChart, key: 'analytics' },
                { icon: Server, key: 'rack' }
              ].map((feature, index) => (
                <motion.div
                  key={feature.key}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  animate={featuresInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="relative"
                >
                  <div className="absolute flex items-center justify-center h-12 w-12 rounded-md bg-indigo-500 text-white">
                    <feature.icon size={24} />
                  </div>
                  <p className="ml-16 text-lg leading-6 font-medium text-white">
                    {t(`landing.features.${feature.key}.title`)}
                  </p>
                  <p className="mt-2 ml-16 text-base text-gray-300">
                    {t(`landing.features.${feature.key}.description`)}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Section */}
      <motion.div
        ref={statsRef}
        initial={{ opacity: 0, y: 20 }}
        animate={statsInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="bg-gray-900 bg-opacity-50"
      >
        <div className="max-w-7xl mx-auto py-12 px-4 sm:py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              {t('landing.stats.title')}
            </h2>
            <p className="mt-3 text-xl text-gray-300 sm:mt-4">
              {t('landing.stats.subtitle')}
            </p>
          </div>
          <dl className="mt-10 text-center sm:max-w-3xl sm:mx-auto sm:grid sm:grid-cols-3 sm:gap-8">
            <div className="flex flex-col">
              <dt className="order-2 mt-2 text-lg leading-6 font-medium text-gray-300">
                {t('landing.stats.uptime')}
              </dt>
              <dd className="order-1 text-5xl font-extrabold text-indigo-400">
                99.9%
              </dd>
            </div>
            <div className="flex flex-col mt-10 sm:mt-0">
              <dt className="order-2 mt-2 text-lg leading-6 font-medium text-gray-300">
                {t('landing.stats.savings')}
              </dt>
              <dd className="order-1 text-5xl font-extrabold text-indigo-400">
                30%
              </dd>
            </div>
            <div className="flex flex-col mt-10 sm:mt-0">
              <dt className="order-2 mt-2 text-lg leading-6 font-medium text-gray-300">
                {t('landing.stats.response')}
              </dt>
              <dd className="order-1 text-5xl font-extrabold text-indigo-400">
                &lt;1s
              </dd>
            </div>
          </dl>
        </div>
      </motion.div>

      {/* CTA Section */}
      <motion.div
        ref={ctaRef}
        initial={{ opacity: 0, y: 20 }}
        animate={ctaInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="bg-indigo-700"
      >
        <div className="max-w-2xl mx-auto text-center py-16 px-4 sm:py-20 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            <span className="block">{t('landing.cta.title')}</span>
            <span className="block">{t('landing.cta.subtitle')}</span>
          </h2>
          <p className="mt-4 text-lg leading-6 text-indigo-200">
            {t('landing.cta.description')}
          </p>
          <button
            onClick={() => navigate('/login')}
            className="mt-8 w-full inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-indigo-600 bg-white hover:bg-indigo-50 sm:w-auto"
          >
            {t('landing.cta.button')}
            <ArrowRight size={20} className="ml-2" />
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default LandingPage;