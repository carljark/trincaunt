import React from 'react';
import { IBalance } from '../types/balance';
import { ISettleGroupDebtsTransaction } from '../types/transaction';
import { ArrowRightIcon } from './icons';
import './BalancesTab.scss';

interface BalancesTabProps {
  totalExpenses: number;
  myShare: number;
  myPayments: number;
  mySettled: number;
  myBalance: number;
  balances: IBalance[];
  settlements: ISettleGroupDebtsTransaction[];
  onRecordPayment: () => void;
  onShowPaymentHistory: () => void;
}

const formatEuros = (amount: number) =>
  amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

// Modificador de color según el signo, para el elemento indicado (amount o total-amount)
const signModifier = (element: string, amount: number) => {
  if (amount > 0) return `balances__${element}--positive`;
  if (amount < 0) return `balances__${element}--negative`;
  return '';
};

const BalancesTab: React.FC<BalancesTabProps> = ({
  totalExpenses, myShare, myPayments, mySettled, myBalance, balances, settlements, onRecordPayment, onShowPaymentHistory
}) => (
  <div className="balances">
    <section className="balances__card">
      <h3 className="balances__title">Tu resumen</h3>
      <dl className="balances__stats">
        <div className="balances__stat">
          <dt className="balances__label">Total del grupo</dt>
          <dd className="balances__amount">{formatEuros(totalExpenses)}</dd>
        </div>
        <div className="balances__stat">
          <dt className="balances__label">Mi parte</dt>
          <dd className="balances__amount">{formatEuros(myShare)}</dd>
        </div>
        <div className="balances__stat">
          <dt className="balances__label">He pagado</dt>
          <dd className="balances__amount">{formatEuros(myPayments)}</dd>
        </div>
        <div className="balances__stat">
          <dt className="balances__label">Saldado</dt>
          <dd className="balances__amount">{formatEuros(mySettled)}</dd>
        </div>
      </dl>
      <div className="balances__total">
        {/* Positivo: has pagado más de tu parte, el grupo te debe */}
        <span className="balances__total-label">
          {myBalance > 0 ? 'Te deben' : myBalance < 0 ? 'Debes' : 'Estás al día'}
        </span>
        <span className={`balances__total-amount ${signModifier('total-amount', myBalance)}`}>{formatEuros(Math.abs(myBalance))}</span>
      </div>
    </section>

    <section className="balances__card">
      <h3 className="balances__title">Balance del grupo</h3>
      <ul className="balances__list">
        {balances.map(m => (
          <li key={m.id} className="balances__row">
            <span className="balances__name">{m.nombre}</span>
            <span className={`balances__amount ${signModifier('amount', m.balance)}`}>{formatEuros(m.balance)}</span>
          </li>
        ))}
      </ul>
    </section>

    <section className="balances__card">
      <h3 className="balances__title">Para saldar deudas</h3>
      {settlements.length > 0 ? (
        <ul className="balances__list">
          {settlements.map((tx, index) => (
            <li key={index} className="balances__row">
              <span className="balances__transfer">
                <span className="balances__name">{tx.from.nombre}</span>
                <ArrowRightIcon className="balances__arrow" />
                <span className="balances__name">{tx.to.nombre}</span>
              </span>
              <span className="balances__amount">{formatEuros(tx.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="balances__empty">No hay deudas pendientes. ¡Todo saldado!</p>
      )}
    </section>

    <div className="balances__actions">
      <button type="button" className="balances__button balances__button--primary" onClick={onRecordPayment}>
        Registrar pago
      </button>
      <button type="button" className="balances__button balances__button--secondary" onClick={onShowPaymentHistory}>
        Historial de pagos
      </button>
    </div>
  </div>
);

export default BalancesTab;
