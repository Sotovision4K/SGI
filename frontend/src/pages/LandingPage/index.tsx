import { lazy } from 'react';

export const LandingPage = lazy(() => import('../../components/landing/LandingPage').then(m => ({ default: m.LandingPage })));