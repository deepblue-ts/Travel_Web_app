// server/services/persist.js
import { ExcelLogger } from '../excelLogger.js';

export async function persistItineraryAndExport(planId, itinerary, extra = {}) {
  if (!planId || !Array.isArray(itinerary)) return null;
  try {
    const logger = new ExcelLogger(planId);
    const finalPlan = { itinerary, ...extra };
    const xlsxPath = await logger.exportXlsx(finalPlan);
    return { finalPlan, xlsxPath };
  } catch (e) {
    console.warn('persistItineraryAndExport failed (ignored):', e.message);
    return null;
  }
}
