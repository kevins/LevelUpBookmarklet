import { DynamicsApi } from './dynamics-api';
import type { SolutionInfo } from './types';

export const DEFAULT_SOLUTION_ID = 'fd140aaf-4df4-11dd-bd17-0019b9312238';

export class SolutionResolver {
  private cached?: SolutionInfo;
  constructor(private api: DynamicsApi) {}

  async get(): Promise<SolutionInfo> {
    if (this.cached) return this.cached;
    try {
      const result = await this.api.get<{ value: Record<string, unknown>[] }>("solutions?$select=solutionid,friendlyname&$filter=uniquename eq 'Default'&$top=1");
      const solution = result.value?.[0];
      if (solution?.solutionid) {
        this.cached = { solutionId: String(solution.solutionid).replace(/[{}]/g, ''), friendlyName: String(solution.friendlyname ?? 'Default Solution'), usedDefaultSolution: true };
        return this.cached;
      }
    } catch { /* constant fallback */ }
    this.cached = { solutionId: DEFAULT_SOLUTION_ID, friendlyName: 'Default Solution', usedDefaultSolution: true };
    return this.cached;
  }
}
