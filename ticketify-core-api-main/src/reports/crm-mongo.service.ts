import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Db, MongoClient, ServerApiVersion } from 'mongodb';

/**
 * One shared, lazily-connected client for the CRM reporting database.
 * Fails fast (instead of the driver's 30s default) so report screens can show
 * a clear error, and resets after a failed connect so the next request retries.
 */
@Injectable()
export class CrmMongoService implements OnModuleDestroy {
  private readonly logger = new Logger(CrmMongoService.name);
  private connecting: Promise<MongoClient> | null = null;

  constructor(private readonly config: ConfigService) {}

  async db(): Promise<Db> {
    const client = await this.client();
    return client.db(this.config.get<string>('MONGO_DB_NAME') ?? 'CRM');
  }

  private client(): Promise<MongoClient> {
    if (this.connecting) return this.connecting;

    const uri = this.config.get<string>('MONGO_URI')?.trim();
    if (!uri) {
      throw new ServiceUnavailableException(
        'Reports database is not configured (MONGO_URI is missing).',
      );
    }

    const timeoutMs = Number(this.config.get('MONGO_CONNECT_TIMEOUT_MS') ?? 8_000);
    const client = new MongoClient(uri, {
      serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
      serverSelectionTimeoutMS: timeoutMs,
      connectTimeoutMS: timeoutMs,
      maxPoolSize: 10,
    });

    this.connecting = client.connect().catch(async error => {
      this.connecting = null;
      await client.close().catch(() => undefined);
      this.logger.error(`MongoDB connection failed: ${error?.message ?? error}`);
      throw new ServiceUnavailableException(
        'Reports database is unreachable right now. Please try again in a minute.',
      );
    });
    return this.connecting;
  }

  /** Runs an operation and maps driver/network failures to a clear 503. */
  async run<T>(operation: (db: Db) => Promise<T>): Promise<T> {
    const db = await this.db();
    try {
      return await operation(db);
    } catch (error: any) {
      if (error?.name === 'MongoServerSelectionError' || error?.name === 'MongoNetworkError') {
        const stale = this.connecting;
        this.connecting = null;
        stale?.then(client => client.close()).catch(() => undefined);
        this.logger.error(`MongoDB query failed: ${error.message}`);
        throw new ServiceUnavailableException(
          'Reports database is unreachable right now. Please try again in a minute.',
        );
      }
      throw error;
    }
  }

  async onModuleDestroy() {
    const pending = this.connecting;
    this.connecting = null;
    if (pending) {
      const client = await pending.catch(() => null);
      await client?.close().catch(() => undefined);
    }
  }
}
