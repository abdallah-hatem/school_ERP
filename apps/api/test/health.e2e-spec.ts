import { INestApplication } from '@nestjs/common';
import { createApp, http } from './helpers';

describe('foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health is public and enveloped', async () => {
    const res = await http(app).get('/health').expect(200);
    expect(res.body).toMatchObject({ success: true, statusCode: 200, data: { status: 'ok' } });
  });

  it('an unknown route fails inside the envelope', async () => {
    const res = await http(app).get('/does-not-exist').expect(404);
    expect(res.body).toMatchObject({ success: false, statusCode: 404 });
  });
});
