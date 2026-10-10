// The one place that names the repository. Change it here if the repository moves.
export const REPO = 'joezzy-web3/off-hours';
export const GITHUB = `https://github.com/${REPO}`;
/** Where the scheduled agent publishes its files every hour. */
export const FEED = `https://raw.githubusercontent.com/${REPO}/main/live`;
export const DOC = (path: string) => `${GITHUB}/blob/main/${path}`;
