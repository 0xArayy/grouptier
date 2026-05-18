export function buildVoteUrl(sessionId: string): string {
  const tgLink = (process.env.MINI_APP_TGLINK ?? '').replace(/\/$/, '');
  return `${tgLink}?startapp=${sessionId}`;
}
