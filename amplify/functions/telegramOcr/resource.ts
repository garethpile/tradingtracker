import { defineFunction } from '@aws-amplify/backend';
import { Duration } from 'aws-cdk-lib';
import { Architecture, DockerImageCode, DockerImageFunction } from 'aws-cdk-lib/aws-lambda';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const telegramOcr = defineFunction((scope) => (
  new DockerImageFunction(scope, 'telegramOcr', {
    code: DockerImageCode.fromImageAsset(currentDir),
    architecture: Architecture.ARM_64,
    memorySize: 2048,
    timeout: Duration.seconds(120),
  })
));
