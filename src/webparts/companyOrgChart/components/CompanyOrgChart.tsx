import * as React from 'react';
import { IOrgNode, IOrgUser } from '../services/GraphService';
import { ICompanyOrgChartProps } from './ICompanyOrgChartProps';

interface State {
  loading: boolean;
  search: string;
  searchResults: IOrgUser[];
  searching: boolean;
  expandedNodes: Set<string>;
  currentView: 'company' | 'subtree'; // 👈 Stato visualizzazione
  departments: { name: string, count: number }[];
  locations: string[];
  selectedDepartment?: string;
  selectedLocation?: string;
  selectedTitle?: string;
  selectedLetter?: string; // 👈 Filtro Alfabetico
  hoveredNodeId?: string;
  orgTree?: IOrgNode;
  viewMode: 'tree' | 'grid'; // 👈 Scelta visualizzazione
  showAdmin: boolean;
  isMobile: boolean; // 👈 Per responsive
}

export default class CompanyOrgChart
  extends React.Component<ICompanyOrgChartProps, State> {

  state: State = {
    loading: true,
    search: '',
    searchResults: [],
    searching: false,
    expandedNodes: new Set<string>(),
    currentView: 'company',
    departments: [],
    locations: [],
    selectedDepartment: undefined,
    selectedLocation: undefined,
    selectedTitle: undefined,
    viewMode: 'tree',
    showAdmin: false,
    isMobile: window.innerWidth < 768
  };

  async componentDidMount(): Promise<void> {
    window.addEventListener('resize', this.updateDimensions);
    await Promise.all([
      this.loadTree(),
      this.loadMetadata()
    ]);
  }

  componentWillUnmount(): void {
    window.removeEventListener('resize', this.updateDimensions);
  }

  private updateDimensions = (): void => {
    this.setState({ isMobile: window.innerWidth < 768 });
  }

  private async loadMetadata(): Promise<void> {
    try {
      const meta = await this.props.graphService.getCompanyMetadata();
      this.setState({ departments: meta.departments, locations: meta.locations });
    } catch (e) {
      console.error("Error loading metadata", e);
    }
  }

  private async loadTree(userId?: string, onlySubtree: boolean = false): Promise<void> {
    this.setState({
      loading: true,
      search: '',
      selectedLetter: undefined,
      selectedDepartment: undefined,
      selectedLocation: undefined,
      selectedTitle: undefined,
      searchResults: [],
      searching: false
    });

    try {
      let targetId = userId;
      let isFixedRoot = false;

      // Se NON vogliamo solo il sottoalbero e non abbiamo un ID specifico, 
      // proviamo a usare la mail radice (CEO) se configurata.
      if (!onlySubtree && !targetId && this.props.rootUserEmail) {
        const user = await this.props.graphService.getUserByEmail(this.props.rootUserEmail);
        if (user) {
          targetId = user.id;
          isFixedRoot = true; // ABBIAMO IL CEO: Non risalire oltre!
        }
      }

      // Passiamo isFixedRoot al service
      const tree = await this.props.graphService.getOrgTree(targetId, onlySubtree, isFixedRoot);

      // Espandi il primo livello per default
      const expanded = new Set<string>();
      if (tree) expanded.add(tree.id);

      this.setState({
        orgTree: tree,
        loading: false,
        expandedNodes: expanded,
        currentView: onlySubtree ? 'subtree' : 'company'
      });
    } catch (error) {
      console.error("Error loading tree", error);
      this.setState({ loading: false });
    }
  }

  private toggleExpand = (nodeId: string): void => {
    const { expandedNodes } = this.state;
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    this.setState({ expandedNodes: newExpanded });
  }

  private applyFilters = async (
    query?: string,
    dept?: string,
    loc?: string,
    title?: string,
    letter?: string
  ): Promise<void> => {
    this.setState({ searching: true });

    // Determine effective letter to use
    // If 'letter' arg is provided (even empty string), use it.
    // If undefined, fallback to state.
    const activeLetter = letter !== undefined ? letter : this.state.selectedLetter;

    // However, GraphService.getUsers (API version) handles logic differently.
    // We pass 'query' as text. If 'activeLetter' is set, we might need to handle it.
    // In our previous "good" version, we treated 'letter' as text query if query was empty? 
    // Or we merged them?

    // Let's look at how handleAlphabetClick and handleSearch work.
    // If alphabet is clicked => query is cleared. 
    // If search is typed => alphabet is cleared.
    // So usually only one is active.

    // We pass `query || activeLetter` to getUsers, because getUsers' logic handles single-letter query 
    // by searching StartsWith(Surname), etc.
    // AND if dept/loc/title are set, they are passed too.

    const effectiveQuery = query || activeLetter;

    try {
      const results = await this.props.graphService.getUsers(effectiveQuery, dept, loc, title);
      this.setState({ searchResults: results, searching: false });
    } catch (error) {
      console.error("Error applying filters", error);
      this.setState({ searching: false });
    }
  }

  private handleSearch = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const val = e.target.value;

    // 🔧 FIX: Reset dipartimento e alfabeto quando si usa la ricerca
    this.setState({
      search: val,
      selectedLetter: undefined,
      selectedDepartment: undefined
    });

    if (val.length >= 3) {
      // Cerca in tutta l'azienda (senza filtro dipartimento), ma mantiene sede se selezionata
      await this.applyFilters(val, undefined, this.state.selectedLocation, this.state.selectedTitle, undefined);
    } else if (val.length === 0) {
      // Se cancella la ricerca
      // Dipartimento e Alfabeto sono stati resettati (undefined).
      // Controlliamo solo se c'è una Sede attiva.
      if (!this.state.selectedLocation) {
        // Nessun filtro attivo -> Reset risultati
        this.setState({ searchResults: [], searching: false });
      } else {
        // Sede attiva -> Mostra tutti nella sede
        await this.applyFilters(undefined, undefined, this.state.selectedLocation, this.state.selectedTitle, undefined);
      }
    }
  }

  private handleAlphabetClick = async (letter: string): Promise<void> => {
    const nextLetter = this.state.selectedLetter === letter ? undefined : letter;
    this.setState({ selectedLetter: nextLetter, search: '' });
    // Aggiorniamo subito la ricerca con la lettera (e resettando la search testuale come da UI)
    await this.applyFilters(undefined, this.state.selectedDepartment, this.state.selectedLocation, this.state.selectedTitle, nextLetter);
  }

  private renderCard(user: IOrgNode | IOrgUser, isTree: boolean = true): JSX.Element {
    const isExpanded = isTree && this.state.expandedNodes.has(user.id);
    const hasChildren = isTree && (user as IOrgNode).children && (user as IOrgNode).children.length > 0;
    const isHovered = this.state.hoveredNodeId === user.id;

    const actionBtnStyle: React.CSSProperties = {
      width: 28, height: 28, display: 'flex', alignItems: 'center',
      justifyContent: 'center', borderRadius: '50%', cursor: 'pointer',
      transition: 'all 0.2s', border: '1px solid #eee', background: '#fff'
    };

    return (
      <div
        key={user.id}
        onMouseEnter={() => this.setState({ hoveredNodeId: user.id })}
        onMouseLeave={() => this.setState({ hoveredNodeId: undefined })}
        style={{
          width: 240, // 👈 Aumentato per migliore leggibilità
          border: '1px solid #e1e1e1',
          borderRadius: 8,
          padding: '12px',
          background: '#fff',
          textAlign: 'left',
          boxShadow: isHovered ? '0 8px 20px rgba(0,0,0,0.12)' : '0 2px 8px rgba(0,0,0,0.05)',
          position: 'relative',
          transition: 'transform 0.25s ease, box-shadow 0.25s ease',
          transform: isHovered ? 'translateY(-5px)' : 'none',
          cursor: hasChildren ? 'pointer' : 'default',
          zIndex: isHovered ? 10001 : 1
        }}
        onClick={() => hasChildren && this.toggleExpand(user.id)}
      >
        {/* Persona Card on Hover - IMPROVED DESIGN */}
        {isHovered && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            paddingBottom: 25,
            width: 260,
            zIndex: 99999, // 👈 Massimo livello di sovrapposizione
            animation: 'fadeIn 0.2s ease-out',
            pointerEvents: 'auto'
          }}>
            <div style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 15px 35px rgba(0,0,0,0.2), 0 5px 15px rgba(0,0,0,0.1)',
              padding: '20px',
              textAlign: 'center',
              border: '1px solid #eef2f6',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Sfondo decorativo testata */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderBottom: '1px solid #f1f5f9', zIndex: 0 }} />

              {/* Piccola freccia in basso (Puntatore) */}
              <div style={{
                position: 'absolute',
                bottom: -8,
                left: 'calc(50% - 8px)',
                width: 16,
                height: 16,
                background: '#fff',
                transform: 'rotate(45deg)',
                borderBottom: '1px solid #eef2f6',
                borderRight: '1px solid #eef2f6',
                zIndex: 1
              }} />

              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: '#f8fafc',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  fontWeight: 700,
                  margin: '0 auto 12px',
                  flexShrink: 0,
                  overflow: 'hidden',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
                  border: '3px solid #fff'
                }}>
                  {user.photoUrl ? (
                    <img
                      src={user.photoUrl}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                </div>

                <div style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>{user.displayName}</div>
                <div style={{ fontSize: 12, color: '#0078D4', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{user.jobTitle}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <svg viewBox="0 0 24 24" style={{ width: 12, height: 12, fill: '#94a3b8' }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" /></svg>
                  {user.officeLocation || 'Sede Centrale'}
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 15, marginBottom: 15 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#334155', background: '#f8fafc', padding: '6px 10px', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                    <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: '#0078D4', marginRight: 8 }}><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={user.mail}>{user.mail}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={`mailto:${user.mail}`} onClick={(e) => e.stopPropagation()} style={{ flex: 1, textDecoration: 'none' }}>
                    <div style={{ background: '#0078D4', color: '#fff', padding: '10px', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 6px rgba(0, 120, 212, 0.2)' }}>
                      Email
                    </div>
                  </a>
                  <a href={`https://teams.microsoft.com/l/chat/0/0?users=${user.userPrincipalName}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ flex: 1, textDecoration: 'none' }}>
                    <div style={{ background: '#6264A7', color: '#fff', padding: '10px', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 6px rgba(98, 100, 167, 0.2)' }}>
                      Teams
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header: Photo & Name */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ position: 'relative', width: 48, height: 48, marginRight: 12, flexShrink: 0, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#475569', overflow: 'hidden' }}>
            {user.photoUrl ? (
              <img
                src={user.photoUrl}
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : user.displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
            <div style={{
              position: 'absolute', bottom: 2, right: 2, width: 10, height: 10,
              background: '#107C10', borderRadius: '50%', border: '2px solid #fff'
            }} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.displayName}
            </div>
            <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.jobTitle}
            </div>
          </div>
        </div>

        {/* Action Icons Bar */}
        <div style={{ display: 'flex', borderTop: '1px solid #f0f0f0', paddingTop: 10, justifyContent: 'space-around' }}>
          {user.mail && (
            <a href={`mailto:${user.mail}`} title="Email" onClick={(e) => e.stopPropagation()} style={actionBtnStyle}>
              <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: '#0078D4' }}><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /></svg>
            </a>
          )}
          {user.userPrincipalName && (
            <a href={`https://teams.microsoft.com/l/chat/0/0?users=${user.userPrincipalName}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={actionBtnStyle}>
              <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: '#6264A7' }}><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 9H8v7H5v-7H2V9h10v3z" /></svg>
            </a>
          )}
          {hasChildren && (
            <div style={{ ...actionBtnStyle, background: isExpanded ? '#0078D4' : '#fff' }}>
              <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, fill: isExpanded ? '#fff' : '#0078D4' }}>
                <path d={isExpanded ? "M19 13H5v-2h14v2z" : "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"} />
              </svg>
            </div>
          )}
        </div>

        {/* Pulsante 'Visualizza da qui' nella ricerca */}
        {!isTree && (
          <button
            onClick={(e) => { e.stopPropagation(); this.loadTree(user.id).catch(() => { }); }}
            style={{
              width: '100%', padding: '6px 0', marginTop: 10,
              background: '#f0f0f0', color: '#0078D4', border: 'none',
              borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 'bold'
            }}
          >
            IMPOSTA COME CAPO
          </button>
        )}
      </div>
    );
  }

  private renderTree(node: IOrgNode): JSX.Element | null {
    if (!node) return null;
    const isExpanded = this.state.expandedNodes.has(node.id);
    const isNodeOrChildHovered = this.state.hoveredNodeId === node.id;

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        margin: '0 12px', // 👈 Aumentato spazio laterale tra rami
        position: 'relative',
        zIndex: isNodeOrChildHovered ? 100 : 1 // 👈 Subtree elevation
      }}>
        <div style={{ marginBottom: 40, zIndex: 1, position: 'relative' }}> {/* 👈 Abbassato a 1 per far passare i figli sopra */}
          {this.renderCard(node)}

          {/* Linea verticale sotto la card (OUTPUT) */}
          {isExpanded && node.children && node.children.length > 0 && (
            <div style={{
              position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)',
              width: 2, height: 40, background: '#94a3b8' // 👈 Linea più spessa e scura
            }} />
          )}
        </div>

        {isExpanded && node.children && node.children.length > 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'center',
            position: 'relative',
            zIndex: isNodeOrChildHovered ? 10000 : 1 // 👈 MASSIMA priorità ai figli per sovrapporre il padre
          }}>
            {node.children.map((child: IOrgNode, index: number) => {
              const isFirst = index === 0;
              const isLast = index === node.children!.length - 1;
              const isOnly = node.children!.length === 1;

              return (
                <div key={child.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                  {/* LINEE DI CONNESSIONE */}
                  {!isOnly && (
                    <>
                      {/* Linea Orizzontale Sinistra */}
                      {!isFirst && <div style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: 2, background: '#94a3b8' }} />}

                      {/* Linea Orizzontale Destra */}
                      {!isLast && <div style={{ position: 'absolute', top: 0, right: 0, width: '50%', height: 2, background: '#94a3b8' }} />}
                    </>
                  )}

                  {/* Linea Verticale Sopra (INPUT) */}
                  <div style={{ width: 2, height: 40, background: '#94a3b8', marginBottom: 0, position: 'relative' }}>
                    {/* Pallino di giunzione per un look più rifinito */}
                    <div style={{ position: 'absolute', top: -4, left: -3, width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} />
                  </div>

                  {/* Ricorsione */}
                  {this.renderTree(child)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Helper per appiattire l'albero in griglia
  private getAllNodes(node: IOrgNode): IOrgUser[] {
    let nodes: IOrgUser[] = [];
    if (node.children) {
      node.children.forEach((c: IOrgNode) => {
        nodes.push(c);
        nodes = nodes.concat(this.getAllNodes(c));
      });
    }
    return nodes;
  }

  private handleFilterChange = async (dept?: string, loc?: string, title?: string): Promise<void> => {
    // 🎯 LOGICA SEMPLIFICATA E PREVEDIBILE:
    // 
    // 1. CLICK SU TAB DIPARTIMENTO → Reset TUTTO (sede, ricerca, alfabeto)
    //    Motivo: I tab dipartimento sono il filtro "primario", partono da zero
    // 
    // 2. CAMBIO SEDE → Reset dipartimento, MA mantiene ricerca/alfabeto
    //    Motivo: Puoi cercare "petrone" in una sede specifica
    // 
    // 3. CAMBIO TITOLO → Mantiene tutto
    //    Motivo: Puoi cercare dentro un dipartimento o sede

    const isDeptChange = dept !== undefined;
    const isLocChange = loc !== undefined;
    const isTitleChange = title !== undefined;

    let newDept: string | undefined;
    let newLoc: string | undefined;
    let newTitle: string | undefined;
    let newSearch: string;
    let newLetter: string | undefined;

    if (isDeptChange) {
      // CASO 1: Click su tab dipartimento → RESET TOTALE
      newDept = dept || undefined;
      newLoc = undefined;           // Reset sede
      newTitle = undefined;
      newSearch = '';                // Reset ricerca
      newLetter = undefined;         // Reset alfabeto
    } else if (isLocChange) {
      // CASO 2: Cambio sede → Reset dipartimento, mantiene ricerca/alfabeto
      newDept = undefined;           // Reset dipartimento
      newLoc = loc || undefined;
      newTitle = this.state.selectedTitle;
      newSearch = this.state.search;      // Mantiene ricerca
      newLetter = this.state.selectedLetter; // Mantiene alfabeto
    } else if (isTitleChange) {
      // CASO 3: Cambio titolo → Mantiene tutto
      newDept = this.state.selectedDepartment;
      newLoc = this.state.selectedLocation;
      newTitle = title || undefined;
      newSearch = this.state.search;
      newLetter = this.state.selectedLetter;
    } else {
      // Fallback: mantiene tutto
      newDept = this.state.selectedDepartment;
      newLoc = this.state.selectedLocation;
      newTitle = this.state.selectedTitle;
      newSearch = this.state.search;
      newLetter = this.state.selectedLetter;
    }

    // Aggiorna lo stato
    this.setState({
      selectedDepartment: newDept,
      selectedLocation: newLoc,
      selectedTitle: newTitle,
      search: newSearch,
      selectedLetter: newLetter
    });

    // Applica i filtri
    await this.applyFilters(
      newSearch || newLetter,
      newDept,
      newLoc,
      newTitle,
      newLetter
    );
  }

  render(): JSX.Element {
    const {
      loading, orgTree, search, searchResults, searching,
      selectedLetter, departments, locations,
      selectedDepartment, selectedLocation, selectedTitle, viewMode,
      isMobile
    } = this.state;

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const isSearchActive = (search && search.length >= 3) || !!selectedLetter || !!selectedDepartment || !!selectedLocation || !!selectedTitle;

    if (loading) return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#5e5adb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 20 }} />
        <div style={{ fontSize: 16, color: '#64748b', fontWeight: 500 }}>Sincronizzazione Organigramma...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );

    return (
      <div style={{ padding: '0', backgroundColor: '#f4f7fa', minHeight: '100vh', fontFamily: '"Segoe UI", sans-serif' }}>

        {/* TOP HEADER - DEPARTMENT TABS */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '15px 20px', position: 'sticky', top: 0, zIndex: 1000, boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
            <button
              onClick={() => this.handleFilterChange('')}
              style={{
                padding: '10px 20px', borderRadius: 6, border: 'none', fontWeight: 600, fontSize: 13,
                background: !selectedDepartment ? '#5e5adb' : '#f1f5f9',
                color: !selectedDepartment ? '#fff' : '#64748b',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
                boxShadow: !selectedDepartment ? '0 2px 4px rgba(94, 90, 219, 0.3)' : 'none'
              }}
            >
              Tutti i Dipartimenti
            </button>
            {departments.map(dept => (
              <button
                key={dept.name}
                onClick={() => this.handleFilterChange(dept.name)}
                style={{
                  padding: '10px 20px', borderRadius: 6, border: 'none', fontWeight: 600, fontSize: 13,
                  background: selectedDepartment === dept.name ? '#5e5adb' : '#f1f5f9',
                  color: selectedDepartment === dept.name ? '#fff' : '#64748b',
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
                  boxShadow: selectedDepartment === dept.name ? '0 2px 4px rgba(94, 90, 219, 0.3)' : 'none'
                }}
              >
                {dept.name} ({dept.count})
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: '1600px', margin: '0 auto', padding: isMobile ? '10px 15px' : '20px 30px' }}>

          {/* ACTION BAR */}
          <div style={{
            display: 'flex', flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center',
            marginBottom: 20, gap: 15
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24, color: '#1e293b' }}>Struttura Aziendale</h2>
              <div style={{ background: '#fff', borderRadius: 8, padding: 4, display: 'flex', border: '1px solid #e2e8f0' }}>
                <button
                  onClick={() => this.setState({ viewMode: 'tree' })}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: viewMode === 'tree' ? '#ecfdf5' : 'transparent', color: viewMode === 'tree' ? '#10b981' : '#64748b',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  🌳 Albero
                </button>
                <button
                  onClick={() => this.setState({ viewMode: 'grid' })}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: viewMode === 'grid' ? '#eff6ff' : 'transparent', color: viewMode === 'grid' ? '#3b82f6' : '#64748b',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  ▦ Griglia
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
              <button
                onClick={() => this.loadTree(undefined, true)}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #3b82f6', background: '#fff', color: '#3b82f6', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
              >
                Mia Posizione
              </button>
              <button
                onClick={() => this.loadTree()}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0078D4', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, boxShadow: '0 4px 6px rgba(37, 99, 235, 0.2)' }}
              >
                Vista Aziendale
              </button>
            </div>
          </div>

          {/* FILTER ROW */}
          <div style={{
            background: '#fff', padding: 20, borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,0.02)', marginBottom: 25,
            display: 'flex', flexWrap: 'wrap', gap: 15, alignItems: 'center', border: '1px solid #e2e8f0'
          }}>
            <div style={{ flex: '1 1 300px', position: 'relative' }}>
              <svg style={{ position: 'absolute', left: 12, top: 12, width: 18, height: 18, fill: '#94a3b8' }} viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
              <input
                type="text"
                placeholder="Cerca collega..."
                value={search}
                onChange={this.handleSearch}
                style={{
                  width: '100%', padding: '10px 10px 10px 40px', borderRadius: 8, border: '1px solid #e2e8f0',
                  outline: 'none', fontSize: 15, color: '#1e293b', background: '#f8fafc', fontWeight: 500
                }}
              />
            </div>

            <div style={{ position: 'relative', flex: '0 1 200px' }}>
              <select
                value={selectedLocation || ''}
                onChange={(e) => this.handleFilterChange(undefined, e.target.value || undefined)}
                style={{
                  width: '100%',
                  padding: '10px 35px 10px 40px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  fontSize: 15,
                  appearance: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="">Tutte le Sedi</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <svg style={{ position: 'absolute', left: 14, top: 13, width: 18, height: 18, fill: '#94a3b8' }} viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" /></svg>
              <svg style={{ position: 'absolute', right: 12, top: 16, width: 14, height: 14, fill: '#64748b', pointerEvents: 'none' }} viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z" /></svg>
            </div>

            {/* Alphabet Mini-filter */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: '1 1 100%', marginTop: 5, padding: '15px 0 0', borderTop: '1px solid #f1f5f9', justifyContent: isMobile ? 'center' : 'flex-start' }}>
              <button
                onClick={() => this.handleAlphabetClick('')}
                style={{ padding: '0 12px', height: 34, borderRadius: 6, border: '1px solid #e2e8f0', background: !selectedLetter ? '#5e5adb' : '#fff', color: !selectedLetter ? '#fff' : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >ALL</button>
              {alphabet.map(l => (
                <button
                  key={l} onClick={() => this.handleAlphabetClick(l)}
                  style={{ width: 32, height: 34, borderRadius: 6, border: '1px solid ' + (selectedLetter === l ? '#5e5adb' : '#e2e8f0'), background: selectedLetter === l ? '#5e5adb' : '#fff', color: selectedLetter === l ? '#fff' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >{l}</button>
              ))}
            </div>
          </div>

          {/* CONTENT AREA */}
          {(isSearchActive || viewMode === 'grid') ? (
            <div style={{ animation: 'fadeIn 0.3s ease-in' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                <h3 style={{ margin: 0, fontSize: 15, color: '#1e293b' }}>
                  {searching ? 'Ricerca in corso...' : (
                    isSearchActive
                      ? `${searchResults.length} ${searchResults.length === 1 ? 'Risorsa trovata' : 'Risorse trovate'}`
                      : `${orgTree ? this.getAllNodes(orgTree).length + 1 : 0} Risorse totali`
                  )}
                </h3>
                {searching && <div style={{ width: 16, height: 16, border: '2px solid #e2e8f0', borderTopColor: '#5e5adb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(230px, 1fr))',
                gap: isMobile ? 15 : 20,
                paddingBottom: 80,
                opacity: searching ? 0.6 : 1,
                transition: 'opacity 0.2s'
              }}>
                {isSearchActive ? (
                  searchResults.map(u => this.renderCard(u, false))
                ) : (
                  orgTree ? [orgTree, ...this.getAllNodes(orgTree)].map(u => this.renderCard(u, false)) : null
                )}
              </div>

              {isSearchActive && searchResults.length === 0 && !searching && (
                <div style={{ padding: '60px 20px', textAlign: 'center', background: '#fff', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>Nessun risultato trovato</div>
                  <div style={{ fontSize: 14, color: '#64748b', marginTop: 5 }}>Prova a cambiare i filtri o a ricaricare la pagina.</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              width: '100%',
              padding: isMobile ? '20px 0 80px' : '350px 0 100px', // 👈 Spazio Abbondante per la scheda
              marginTop: isMobile ? '0' : '-200px', // 👈 Compensiamo il vuoto visivo
              position: 'relative',
              overflowX: 'auto',
              textAlign: 'center',
              scrollbarWidth: 'thin',
              WebkitOverflowScrolling: 'touch'
            }}>
              <div style={{
                display: 'inline-block', // 👈 Meglio di inline-flex per il centraggio con text-align
                minWidth: 'fit-content', // 👈 Si adatta al contenuto
                margin: '0 auto',        // 👈 Centra il blocco se più piccolo del contenitore
                padding: '0 20px',
                whiteSpace: 'nowrap'     // 👈 Previene a capo indesiderati
              }}>
                {orgTree ? this.renderTree(orgTree) : <div style={{ textAlign: 'center' }}>Caricamento organigramma...</div>}
              </div>
              {isMobile && (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, marginTop: 15 }}>
                  ↔️ Scorri lateralmente per esplorare l&apos;albero
                </div>
              )}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{
          position: isMobile ? 'relative' : 'fixed',
          bottom: isMobile ? 0 : 15,
          right: isMobile ? 0 : 15,
          background: isMobile ? 'transparent' : '#fff',
          boxShadow: isMobile ? 'none' : '0 4px 12px rgba(0,0,0,0.1)',
          borderRadius: isMobile ? 0 : 20,
          padding: isMobile ? '20px' : '8px 20px',
          textAlign: 'center',
          fontSize: 11,
          color: '#64748b',
          fontWeight: 600,
          zIndex: 1000,
          border: isMobile ? 'none' : '1px solid #e2e8f0'
        }}>
          Implemented by Alessandro Petrone
        </div>
      </div>
    );
  }
}
