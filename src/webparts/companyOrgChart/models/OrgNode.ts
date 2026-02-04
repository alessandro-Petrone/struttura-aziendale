import { IOrgUser } from './IOrgUser';

export interface IOrgNode extends IOrgUser {
  children: IOrgNode[];
}
