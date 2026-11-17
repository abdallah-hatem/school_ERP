import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

/** Boots the real AppModule with the same setup as main.ts, listening on PORT (0 = random). */
export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.listen(app.get(ConfigService).getOrThrow<number>('port'));
  return app;
}

export const http = (app: INestApplication) => request(app.getHttpServer());

let seq = 0;
/** Unique per call: timestamp plus a counter (Date.now() alone collides within a millisecond). */
export const unique = (label: string) => `${label}-${Date.now()}-${seq++}`;
