import type { FrameworkAdapter } from './contracts';
import { detectLaravel, scanLaravelModules } from './laravel';
import { detectGin, scanGinModules } from './gin';
import { detectSpringBoot, scanSpringBootModules } from './springboot';
import { detectVue, scanVueModules } from './vue';
import { detectGoZero, scanGoZeroModules } from './gozero';
import {
  detectSymfony,
  detectThinkPHP,
  scanSymfonyModules,
  scanThinkPHPModules,
} from './phpFrameworks';
import {
  detectDjango,
  detectFastAPI,
  detectFlask,
  scanDjangoModules,
  scanFastAPIModules,
  scanFlaskModules,
} from './pythonFrameworks';
import {
  detectExpress,
  detectNestJS,
  detectNextJS,
  detectReact,
  scanExpressModules,
  scanNestJSModules,
  scanNextJSModules,
  scanReactModules,
} from './nodeFrameworks';
import {
  detectAndroid,
  detectAngular,
  detectAspNetCore,
  detectElectron,
  detectFlutter,
  detectIOS,
  detectKtor,
  detectNuxt,
  detectPhoenix,
  detectRails,
  detectSinatra,
  detectSvelteKit,
  detectTauri,
  scanAndroidModules,
  scanAngularModules,
  scanAspNetCoreModules,
  scanElectronModules,
  scanFlutterModules,
  scanIOSModules,
  scanKtorModules,
  scanNuxtModules,
  scanPhoenixModules,
  scanRailsModules,
  scanSinatraModules,
  scanSvelteKitModules,
  scanTauriModules,
} from './ecosystemFrameworks';

export const FRAMEWORK_ADAPTERS: FrameworkAdapter[] = [
  {
    name: 'Laravel',
    detect: detectLaravel,
    scanModules: scanLaravelModules,
  },
  {
    name: 'Gin',
    detect: detectGin,
    scanModules: scanGinModules,
  },
  {
    name: 'ThinkPHP',
    detect: detectThinkPHP,
    scanModules: scanThinkPHPModules,
  },
  {
    name: 'Symfony',
    detect: detectSymfony,
    scanModules: scanSymfonyModules,
  },
  {
    name: 'Go-Zero',
    detect: detectGoZero,
    scanModules: scanGoZeroModules,
  },
  {
    name: 'Spring Boot',
    detect: detectSpringBoot,
    scanModules: scanSpringBootModules,
  },
  {
    name: 'Django',
    detect: detectDjango,
    scanModules: scanDjangoModules,
  },
  {
    name: 'Flask',
    detect: detectFlask,
    scanModules: scanFlaskModules,
  },
  {
    name: 'FastAPI',
    detect: detectFastAPI,
    scanModules: scanFastAPIModules,
  },
  {
    name: 'NestJS',
    detect: detectNestJS,
    scanModules: scanNestJSModules,
  },
  {
    name: 'Express',
    detect: detectExpress,
    scanModules: scanExpressModules,
  },
  {
    name: 'React',
    detect: detectReact,
    scanModules: scanReactModules,
  },
  {
    name: 'Vue',
    detect: detectVue,
    scanModules: scanVueModules,
  },
  {
    name: 'Next.js',
    detect: detectNextJS,
    scanModules: scanNextJSModules,
  },
  {
    name: 'Angular',
    detect: detectAngular,
    scanModules: scanAngularModules,
  },
  {
    name: 'Nuxt',
    detect: detectNuxt,
    scanModules: scanNuxtModules,
  },
  {
    name: 'SvelteKit',
    detect: detectSvelteKit,
    scanModules: scanSvelteKitModules,
  },
  {
    name: 'Electron',
    detect: detectElectron,
    scanModules: scanElectronModules,
  },
  {
    name: 'Rails',
    detect: detectRails,
    scanModules: scanRailsModules,
  },
  {
    name: 'Sinatra',
    detect: detectSinatra,
    scanModules: scanSinatraModules,
  },
  {
    name: 'ASP.NET Core',
    detect: detectAspNetCore,
    scanModules: scanAspNetCoreModules,
  },
  {
    name: 'Flutter',
    detect: detectFlutter,
    scanModules: scanFlutterModules,
  },
  {
    name: 'Android',
    detect: detectAndroid,
    scanModules: scanAndroidModules,
  },
  {
    name: 'iOS',
    detect: detectIOS,
    scanModules: scanIOSModules,
  },
  {
    name: 'Phoenix',
    detect: detectPhoenix,
    scanModules: scanPhoenixModules,
  },
  {
    name: 'Ktor',
    detect: detectKtor,
    scanModules: scanKtorModules,
  },
  {
    name: 'Tauri',
    detect: detectTauri,
    scanModules: scanTauriModules,
  },
];

export function getFrameworkAdapter(frameworkName: string): FrameworkAdapter | undefined {
  return FRAMEWORK_ADAPTERS.find(adapter => adapter.name === frameworkName);
}
