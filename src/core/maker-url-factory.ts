import type { CloudHosts } from './cloud';

const enc = encodeURIComponent;

export class MakerUrlFactory {
  constructor(private environmentId: () => Promise<string>, private hosts: () => Promise<CloudHosts> = async () => ({ name: 'Commercial', maker: 'https://make.powerapps.com', flow: 'https://make.powerautomate.com', admin: 'https://admin.powerplatform.microsoft.com' })) {}

  private async base(solutionId?: string): Promise<string> {
    const [environment, { maker }] = await Promise.all([this.environmentId(), this.hosts()]);
    const root = `${maker}/environments/${enc(environment)}`;
    return solutionId ? `${root}/solutions/${enc(solutionId)}` : root;
  }

  async solutions(): Promise<string> { return `${await this.base()}/solutions`; }
  async solution(id: string): Promise<string> { return this.base(id); }
  async table(entityMetadataId: string, solutionId: string): Promise<string> { return `${await this.base(solutionId)}/entities/${enc(entityMetadataId)}`; }
  async tableColumns(entityMetadataId: string, solutionId: string): Promise<string> { return `${await this.table(entityMetadataId, solutionId)}/fields`; }
  async form(entityLogicalName: string, formId: string, solutionId: string): Promise<string> {
    const [environment, { maker }] = await Promise.all([this.environmentId(), this.hosts()]);
    return `${maker}/e/${enc(environment)}/s/${enc(solutionId)}/entity/${enc(entityLogicalName)}/form/edit/${enc(formId)}`;
  }
  async solutionHistory(): Promise<string> { return `${await this.base()}/solutionsHistory`; }
  /** The flows base of a solution, so a list of flows resolves the environment once. */
  async flowBase(solutionId: string): Promise<string> {
    const [environment, { flow }] = await Promise.all([this.environmentId(), this.hosts()]);
    return `${flow}/environments/${enc(environment)}/solutions/${enc(solutionId)}/flows`;
  }
  async flow(flowId: string, solutionId: string): Promise<string> { return `${await this.flowBase(solutionId)}/${enc(flowId)}/details`; }
}
