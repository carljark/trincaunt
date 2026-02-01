export interface ISettleGroupDebtsTransaction {
    from: { id: string; nombre: string; };
    to: { id: string; nombre: string; };
    amount: number;
}
