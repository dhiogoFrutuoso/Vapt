import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Plan } from '../models/Plan.js';
import { fallbackPlans } from './plans.data.js';

async function run() {
  await connectDatabase();

  for (const plan of fallbackPlans) {
    await Plan.findOneAndUpdate({ slug: plan.slug }, plan, { upsert: true, new: true });
    console.log(`[seed] plano "${plan.name}" pronto`);
  }

  console.log('[seed] concluido');
  await disconnectDatabase();
  process.exit(0);
}

run().catch((error) => {
  console.error('[seed] falhou:', error);
  process.exit(1);
});
