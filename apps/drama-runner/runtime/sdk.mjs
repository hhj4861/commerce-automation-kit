// Optional local SDK installation. Root commerce npm ci does not resolve these links.
export { digest, parseStrictJson } from '@atomworks/kernel/pure';
export { verifyArtifact } from '@atomworks/kernel/node';
export { createValidator } from '@atomworks/contracts/node';
export { StateStore, locationRejection } from '@atomworks/state-store/node';
export const resolvedEntries = () => Object.fromEntries([
  ['contracts','node'],['kernel','pure'],['kernel','node'],['state-store','node'],
].map(([name,entry]) => [`${name}/${entry}`, import.meta.resolve(`@atomworks/${name}/${entry}`)]));
