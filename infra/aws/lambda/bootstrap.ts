import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { Pool } from 'pg';
import schema from './schema.sql';
import rdsCaBundle from '../certs/ap-south-1-bundle.pem';

export async function handler(event: CloudFormationCustomResourceEvent): Promise<{ PhysicalResourceId: string }> {
  const physicalResourceId = 'hedes-postgres-schema-v1';
  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: physicalResourceId };
  }
  const secretArn = process.env.DB_MASTER_SECRET_ARN;
  if (!secretArn) throw new Error('Database bootstrap secret reference is missing');
  const secret = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: secretArn }));
  const credentials = JSON.parse(secret.SecretString ?? '{}') as { username?: string; password?: string };
  if (!credentials.username || !credentials.password) throw new Error('Database bootstrap secret is incomplete');
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: credentials.username,
    password: credentials.password,
    database: process.env.DB_NAME,
    max: 1,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true, ca: rdsCaBundle },
  });
  try {
    const client = await pool.connect();
    try {
      await client.query(schema);
      return { PhysicalResourceId: physicalResourceId };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('HEDES database bootstrap failed', { name: error instanceof Error ? error.name : 'UnknownError' });
    throw error;
  } finally {
    await pool.end();
  }
}
