import { runScenario } from '../services/scenarioService.js';

export async function scenario(req, res) {
  const result = await runScenario(req.params.name);
  res.json(result);
}
