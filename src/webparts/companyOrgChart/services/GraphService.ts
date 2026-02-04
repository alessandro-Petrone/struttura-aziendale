import { WebPartContext } from '@microsoft/sp-webpart-base';
import { MSGraphClientV3 } from '@microsoft/sp-http';

/** Utente base */
export interface IOrgUser {
  id: string;
  displayName: string;
  jobTitle?: string;
  mail?: string;
  userPrincipalName?: string;
  photoUrl?: string; // FOTO
  mobilePhone?: string;
  officeLocation?: string;
  businessPhones?: string[];
  accountEnabled?: boolean;
  userType?: string;
  surname?: string;
  givenName?: string;
  department?: string; // 👈 Dipartimento
}

/** Nodo organigramma */
export interface IOrgNode extends IOrgUser {
  children: IOrgNode[];
}

export default class GraphService {
  private _context: WebPartContext;

  constructor(context: WebPartContext) {
    this._context = context;
  }

  private async getClient(): Promise<MSGraphClientV3> {
    return this._context.msGraphClientFactory.getClient('3');
  }

  /** Utente corrente */
  public async getMe(): Promise<IOrgUser> {
    const client = await this.getClient();
    return client
      .api('/me')
      .select(
        'id,displayName,jobTitle,mail,userPrincipalName,mobilePhone,officeLocation,businessPhones,accountEnabled,userType,surname,givenName,department'
      )
      .get();
  }

  /** Recupera utente per email */
  public async getUserByEmail(email: string): Promise<IOrgUser | undefined> {
    try {
      const client = await this.getClient();
      const res = await client
        .api(`/users/${email}`)
        .select('id,displayName,jobTitle,mail,userPrincipalName,mobilePhone,officeLocation,businessPhones,accountEnabled,userType,surname,givenName,department')
        .get();
      return res;
    } catch {
      return undefined;
    }
  }

  /** Riporti diretti di un utente */
  public async getDirectReportsByUserId(userId: string): Promise<IOrgUser[]> {
    const client = await this.getClient();

    const res = await client
      .api(`/users/${userId}/directReports`)
      .top(999) // 👈 Recupera più persone contemporaneamente
      .select(
        'id,displayName,jobTitle,mail,userPrincipalName,mobilePhone,officeLocation,businessPhones,accountEnabled,userType,surname,givenName,department'
      )
      .get();

    // Filtro per Utenti Reali (UserMailbox): Attivi, Membri, con email e Cognome
    return (res.value || []).filter((u: IOrgUser) => u.accountEnabled === true && u.userType === 'Member' && u.mail && u.surname);
  }

  /** Ricerca e Filtro unificato (Ricerca testuale + Dipartimento + Sede + Ruolo) */
  public async getUsers(query?: string, department?: string, location?: string, title?: string): Promise<IOrgUser[]> {
    const client = await this.getClient();
    const filters = ["accountEnabled eq true", "userType eq 'Member'"];
    let searchQuery = "";

    // 1. Logica Ricerca
    if (query && query.trim().length > 0) {
      const q = query.trim().replace(/'/g, "''");

      if (q.length === 1) {
        // PER ALFABETO: Usiamo filtro startsWith (preciso per l'iniziale)
        filters.push(`(startsWith(displayName,'${q}') or startsWith(givenName,'${q}') or startsWith(surname,'${q}'))`);
      } else {
        // PER TESTO: Usiamo $search (potente, trova token in nome/cognome/mail)
        // Nota: $search cerca automaticamente in displayName, surname, givenName, mail, userPrincipalName
        searchQuery = `"${q}"`;
      }
    }

    // 2. Filtro Dipartimento
    if (department && department.trim().length > 0) {
      filters.push(`department eq '${department.trim().replace(/'/g, "''")}'`);
    }

    // 3. Filtro Sede
    if (location && location.trim().length > 0) {
      filters.push(`officeLocation eq '${location.trim().replace(/'/g, "''")}'`);
    }

    // 4. Filtro Ruolo
    if (title && title.trim().length > 0) {
      filters.push(`startsWith(jobTitle, '${title.trim().replace(/'/g, "''")}')`);
    }

    // Costruiamo la richiesta
    let req = client.api('/users')
      .header('ConsistencyLevel', 'eventual')
      .count(true)
      .filter(filters.join(' and '))
      .select('id,displayName,jobTitle,mail,userPrincipalName,mobilePhone,officeLocation,businessPhones,accountEnabled,userType,surname,givenName,department')
      .top(999);

    // Applichiamo la search se presente
    if (searchQuery) {
      req = req.search(searchQuery);
    }

    const res = await req.get();

    const users = (res.value || []).filter((u: IOrgUser) => u.mail && u.surname);

    return Promise.all(users.map(async (u: IOrgUser) => {
      const photoUrl = await this.getUserPhotoUrl(u.id, u.mail, u.userPrincipalName);
      return { ...u, photoUrl };
    }));
  }

  /** Recupera foto profilo con multipli fallback per gestire i ritardi di Microsoft 365 */
  private async getUserPhotoUrl(userId: string, userEmail?: string, upn?: string): Promise<string | undefined> {
    const cacheBuster = `&timestamp=${new Date().getTime()}`;
    const account = upn || userEmail;
    const webUrl = this._context.pageContext.web.absoluteUrl;

    try {
      const client = await this.getClient();
      // 1. Proviamo Graph (Qualità migliore, ma propagazione lenta: 24-48h)
      const response = await client.api(`/users/${userId}/photo/$value`).get();
      if (response) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(response);
        });
      }
    } catch {
      // 2. Fallback su SharePoint (Propagazione media: 1-4h)
      if (account) {
        // Proviamo l'endpoint ad alta risoluzione
        return `${webUrl}/_layouts/15/userphoto.aspx?size=HR120x120&accountname=${encodeURIComponent(account)}${cacheBuster}`;
      }
    }

    // 3. Fallback finale (Se tutto il resto fallisce, costruiamo l'URL che si attiva via browser)
    if (account) {
      return `${webUrl}/_layouts/15/userphoto.aspx?size=L&accountname=${encodeURIComponent(account)}${cacheBuster}`;
    }

    return undefined;
  }

  /** Risale fino al TOP manager */
  public async getTopManager(userId?: string): Promise<IOrgUser> {
    let current: IOrgUser;

    const client = await this.getClient();
    if (userId) {
      current = await client.api(`/users/${userId}`).select('id,displayName,jobTitle,mail,userPrincipalName,mobilePhone,officeLocation,businessPhones,accountEnabled,userType,surname,givenName,department').get();
    } else {
      current = await this.getMe();
    }

    let top = current;
    let hasManager = true;

    while (hasManager) {
      try {
        const manager = await client
          .api(`/users/${top.id}/manager`)
          .select(
            'id,displayName,jobTitle,mail,userPrincipalName,mobilePhone,officeLocation,businessPhones,accountEnabled,userType,surname,givenName,department'
          )
          .get();
        if (manager && manager.id) {
          top = manager;
        } else {
          hasManager = false;
        }
      } catch {
        hasManager = false; // STOP LOOP (es. raggiunto il CEO o errore permessi)
      }
    }

    return top;
  }

  /** 🌳 Organigramma completo o locale (Reparto) */
  /** 🌳 Organigramma completo o locale (Reparto) */
  public async getOrgTree(rootId?: string, onlySubtree: boolean = false, fixedRoot: boolean = false): Promise<IOrgNode> {
    const client = await this.getClient();
    let root: IOrgUser;

    if (onlySubtree) {
      // Per "Mia Posizione", cerchiamo di partire dal MANAGER per vedere i colleghi
      const targetId = rootId || (await this.getMe()).id;
      try {
        root = await client
          .api(`/users/${targetId}/manager`)
          .select('id,displayName,jobTitle,mail,userPrincipalName,mobilePhone,officeLocation,businessPhones,accountEnabled,userType,surname,givenName,department')
          .get();
      } catch {
        // Se non ha un manager (es. CEO), parte da se stesso
        root = await client.api(`/users/${targetId}`).select('id,displayName,jobTitle,mail,userPrincipalName,mobilePhone,officeLocation,businessPhones,accountEnabled,userType,surname,givenName,department').get();
      }
    } else {
      // Se fixedRoot è true, usiamo l'ID fornito come radice SENZA risalire
      if (fixedRoot && rootId) {
        root = await client.api(`/users/${rootId}`).select('id,displayName,jobTitle,mail,userPrincipalName,mobilePhone,officeLocation,businessPhones,accountEnabled,userType,surname,givenName,department').get();
      } else {
        root = await this.getTopManager(rootId);
      }
    }

    return this.buildTree(root);
  }

  /** Estrae tutti i dipartimenti e le sedi (metadata) */
  public async getCompanyMetadata(): Promise<{ departments: { name: string, count: number }[], locations: string[] }> {
    const client = await this.getClient();
    // Prendiamo un campione significativo di utenti per estrarre i meta-dati
    const res = await client.api('/users')
      .filter("accountEnabled eq true and userType eq 'Member'")
      .top(999)
      .select('department,officeLocation,mail,surname')
      .get();

    const users = (res.value || []).filter((u: IOrgUser) => u.mail && u.surname);

    // Conteggio dipartimenti
    const deptMap: { [key: string]: number } = {};
    const locationsSet = new Set<string>();

    users.forEach((u: IOrgUser) => {
      if (u.department) {
        const d = u.department.trim();
        if (d) deptMap[d] = (deptMap[d] || 0) + 1;
      }
      if (u.officeLocation) {
        const l = u.officeLocation.trim();
        if (l) locationsSet.add(l);
      }
    });

    const departments = Object.keys(deptMap).map(name => ({ name, count: deptMap[name] })).sort((a, b) => a.name.localeCompare(b.name));
    const locations = Array.from(locationsSet).sort();

    return { departments, locations };
  }

  /** Costruzione ricorsiva */
  private async buildTree(user: IOrgUser): Promise<IOrgNode> {
    const [photoUrl, reports] = await Promise.all([
      this.getUserPhotoUrl(user.id, user.mail, user.userPrincipalName),
      this.getDirectReportsByUserId(user.id)
    ]);

    const children = await Promise.all(reports.map((r: IOrgUser) => this.buildTree(r as IOrgNode)));

    return {
      ...user,
      photoUrl,
      children
    };
  }
}