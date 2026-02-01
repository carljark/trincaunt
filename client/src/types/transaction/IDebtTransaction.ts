export interface IDebtTransaction {
  _id: string;
  from: { _id: string; nombre: string };
  to: { _id: string; nombre: string };
  amount: number;
  paid: boolean;
  createdAt: string;
}
