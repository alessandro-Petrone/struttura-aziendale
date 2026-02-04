import { WebPartContext } from '@microsoft/sp-webpart-base';
import GraphService from '../services/GraphService';

export interface ICompanyOrgChartProps {
  context: WebPartContext;
  graphService: GraphService;

  description: string;
  rootUserEmail: string;
  isDarkTheme: boolean;
  environmentMessage: string;
  hasTeamsContext: boolean;
  userDisplayName: string;
}
