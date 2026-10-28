/** Flips one user's `following` flag in a list, leaving the others alone. */
export function withFollowing<T extends { id: string; following: boolean }>(users: T[], id: string, following: boolean): T[] {
  return users.map((u) => (u.id === id ? { ...u, following } : u));
}
