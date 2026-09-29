// ---- Signs a test agent's phone in with the demo code, as the app does after signup ----

export async function verifyPhone(agent) {
  const sent = await agent.post('/auth/otp/send');
  await agent.post('/auth/otp/verify').send({ code: sent.body.demoCode });
}
