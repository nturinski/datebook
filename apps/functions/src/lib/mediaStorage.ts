import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

type StorageConfig = {
  accountName: string;
  accountKey: string;
  containerName: string;
  blobEndpoint: string;
  isDevelopmentStorage: boolean;
};

const DEVSTORE_ACCOUNT_NAME = "devstoreaccount1";
// Default Azurite/dev storage account key (well-known).
// See Azurite docs for the devstoreaccount1 credentials.
const DEVSTORE_ACCOUNT_KEY =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

function hasUseDevelopmentStorageFlag(connectionString: string): boolean {
  return /(^|;)\s*UseDevelopmentStorage\s*=\s*true\s*(;|$)/i.test(connectionString);
}

function parseStorageFromConnectionString(connectionString: string): {
  accountName: string;
  accountKey: string;
  blobEndpoint?: string;
  isDevelopmentStorage: boolean;
} {
  // Handles typical Azure connection strings:
  // "DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"
  // Also supports Azurite via either a full connection string, or UseDevelopmentStorage=true.

  if (hasUseDevelopmentStorageFlag(connectionString)) {
    return {
      accountName: DEVSTORE_ACCOUNT_NAME,
      accountKey: DEVSTORE_ACCOUNT_KEY,
      // Allow overriding the host for physical devices (127.0.0.1 won't work from the phone).
      blobEndpoint: process.env.MEDIA_BLOB_ENDPOINT ?? `http://127.0.0.1:10000/${DEVSTORE_ACCOUNT_NAME}`,
      isDevelopmentStorage: true,
    };
  }

  const parts = connectionString.split(";").map((p) => p.trim()).filter(Boolean);
  const map = new Map<string, string>();
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    map.set(p.slice(0, idx), p.slice(idx + 1));
  }

  const accountName = map.get("AccountName");
  const accountKey = map.get("AccountKey");
  const blobEndpoint = map.get("BlobEndpoint") ?? undefined;
  if (!accountName || !accountKey) {
    throw new Error(
      "Missing AccountName/AccountKey in storage connection string. Set MEDIA_STORAGE_CONNECTION_STRING (or AZURE_STORAGE_CONNECTION_STRING). For Azurite, set MEDIA_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true and (optionally) MEDIA_BLOB_ENDPOINT=http://127.0.0.1:10000/devstoreaccount1"
    );
  }

  return { accountName, accountKey, blobEndpoint, isDevelopmentStorage: false };
}

function getStorageConfig(): StorageConfig {
  const conn =
    process.env.MEDIA_STORAGE_CONNECTION_STRING ??
    process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!conn || conn.trim().length === 0) {
    throw new Error(
      "Missing MEDIA_STORAGE_CONNECTION_STRING (or AZURE_STORAGE_CONNECTION_STRING). Note: this no longer falls back to AzureWebJobsStorage, because that is often UseDevelopmentStorage=true and can cause confusing Azurite connection errors."
    );
  }

  const { accountName, accountKey, blobEndpoint, isDevelopmentStorage } =
    parseStorageFromConnectionString(conn);
  const containerName = process.env.MEDIA_CONTAINER_NAME ?? "datebook-media";

  // IMPORTANT: MEDIA_BLOB_ENDPOINT is intended as an Azurite/dev-storage override.
  // Do not let it accidentally hijack real Azure Storage accounts.
  const endpoint = isDevelopmentStorage
    ? blobEndpoint ?? `http://127.0.0.1:10000/${DEVSTORE_ACCOUNT_NAME}`
    : blobEndpoint ?? `https://${accountName}.blob.core.windows.net`;

  return {
    accountName,
    accountKey,
    containerName,
    blobEndpoint: endpoint,
    isDevelopmentStorage,
  };
}

let cached: {
  config: StorageConfig;
  service: BlobServiceClient;
  ensureContainerPromise: Promise<void>;
} | null = null;

function getClient(): {
  config: StorageConfig;
  service: BlobServiceClient;
  ensureContainer: () => Promise<void>;
} {
  if (cached) {
    return {
      config: cached.config,
      service: cached.service,
      ensureContainer: () => cached!.ensureContainerPromise,
    };
  }

  const config = getStorageConfig();
  const credential = new StorageSharedKeyCredential(config.accountName, config.accountKey);

  const service = new BlobServiceClient(config.blobEndpoint, credential);

  const containerClient = service.getContainerClient(config.containerName);
  const ensureContainerPromise = containerClient
    .createIfNotExists()
    .then(() => undefined)
    .catch((e) => {
      // Don't swallow this: if the container can't be created (bad key, no perms, network),
      // uploads will fail later in a confusing way.
      console.error("Failed to ensure media container exists", {
        containerName: config.containerName,
        blobEndpoint: config.blobEndpoint,
        isDevelopmentStorage: config.isDevelopmentStorage,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    });

  cached = {
    config,
    service,
    ensureContainerPromise,
  };

  return {
    config,
    service,
    ensureContainer: () => ensureContainerPromise,
  };
}

export type UploadUrlResult = {
  uploadUrl: string;
  blobKey: string;
  expiresAt: string;
};

export async function createUploadUrl(args: {
  blobKey: string;
  contentType?: string;
  expiresInMinutes?: number;
}): Promise<UploadUrlResult> {
  const { config, service, ensureContainer } = getClient();
  await ensureContainer();

  const expiresInMinutes = args.expiresInMinutes ?? 15;
  const now = new Date();
  const startsOn = new Date(now.getTime() - 60_000);
  const expiresOn = new Date(now.getTime() + expiresInMinutes * 60_000);

  const permissions = BlobSASPermissions.parse("cw");

  const credential = new StorageSharedKeyCredential(config.accountName, config.accountKey);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: config.containerName,
      blobName: args.blobKey,
      permissions,
      startsOn,
      expiresOn,
      contentType: args.contentType,
    },
    credential
  ).toString();

  const blobClient = service.getContainerClient(config.containerName).getBlobClient(args.blobKey);
  const uploadUrl = `${blobClient.url}?${sas}`;

  return {
    uploadUrl,
    blobKey: args.blobKey,
    expiresAt: expiresOn.toISOString(),
  };
}
