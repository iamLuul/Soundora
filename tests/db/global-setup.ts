import { resetDatabase } from './helpers.ts';

export default async function setup() {
  await resetDatabase();
}
