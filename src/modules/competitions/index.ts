/**
 * @file modules/competitions/index.ts
 * @description تصدير مكونات المنافسات
 * @description_en Export competition components
 * @module modules/competitions
 * @version 1.0.0
 */

export * from './CompetitionRepository';
export * from './CompetitionService';
export * from './CompetitionController';
export { default as competitionRoutes } from './routes';

// تصدير الكلاسات الرئيسية
export { CompetitionRepository, RatingRepository, CommentRepository } from './CompetitionRepository';
export { CompetitionService } from './CompetitionService';
export { CompetitionController, competitionController } from './CompetitionController';
