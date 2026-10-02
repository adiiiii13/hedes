export interface ReviewRequest {
  id: string;
  hash: string;
  scope: string;
  payload: any;
}
const requests = new Map<string, Promise<boolean>>();
export function requestActionReview(approval: ReviewRequest): Promise<boolean> {
  const existing = requests.get(approval.id);
  if (existing) return existing;
  const promise = new Promise<boolean>(resolve => {
    window.dispatchEvent(new CustomEvent('hedes-action-review', { detail: { approval, resolve } }));
  }).finally(() => requests.delete(approval.id));
  requests.set(approval.id, promise);
  return promise;
}
