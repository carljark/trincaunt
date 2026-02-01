export interface ITransaction {
  from: {
      id: string;
      nombre: string;
  };
  to: {
      id: string;
      nombre: string;
  };
  amount: number;
}
