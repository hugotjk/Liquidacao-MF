export interface Product {
  id: string; // usually same as referencia
  referencia: string;
  descricao: string;
  grupo: string;
  modelo: string;
  precoAntigo: number;
  precoNovo: number;
  importId: string;
  importedAt: string;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  importedAt: string;
  itemsCount: number;
  startDate?: string;
  endDate?: string;
  observation?: string;
}
