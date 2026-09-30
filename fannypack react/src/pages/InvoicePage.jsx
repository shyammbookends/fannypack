import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../shop/api.js';
import { useSeo } from '../shop/useSeo.js';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Printable tax invoice (Print -> Save as PDF to download)
export default function InvoicePage() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');
  useSeo(`Invoice ${number}`, { noindex: true });

  useEffect(() => {
    api.invoice(number, token).then(setInv, (err) => setError(err.message));
  }, [number, token]);

  if (error) {
    return (
      <main className="shop-page container">
        <div className="shop-alert text-center">
          <h3>{error}</h3>
          <Link to={`/order/${number}${token ? `?t=${token}` : ''}`} className="btn-red mt-3">Back to order</Link>
        </div>
      </main>
    );
  }
  if (!inv) {
    return (
      <main className="shop-page container">
        <div className="shop-loading"><span className="shop-spinner"></span>Loading invoice…</div>
      </main>
    );
  }

  const s = inv.seller;
  const totals = inv.lines.reduce((t, l) => ({ taxable: t.taxable + l.taxable, cgst: t.cgst + l.cgst, sgst: t.sgst + l.sgst, igst: t.igst + l.igst }), { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
  const hasTax = inv.lines.some((l) => l.taxRate > 0);

  return (
    <main className="shop-page container invoice-page">
      <div className="invoice-actions no-print">
        <Link to={`/order/${number}${token ? `?t=${token}` : ''}`}><i className="fas fa-arrow-left"></i> Back to order</Link>
        <button type="button" className="pd-btn pd-btn-buy" onClick={() => window.print()}><i className="fas fa-print"></i> Print / Save as PDF</button>
      </div>

      <article className="invoice">
        <header className="invoice-head">
          <div>
            <h1>{hasTax && s.gstin ? 'Tax Invoice' : 'Invoice'}</h1>
            <div className="invoice-meta">
              <div><span>Invoice no.</span><strong>{inv.number}</strong></div>
              <div><span>Date</span><strong>{new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
              <div><span>Payment</span><strong>{inv.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Prepaid (online)'}</strong></div>
            </div>
          </div>
          <div className="invoice-seller">
            <strong>{s.name}</strong>
            {s.brand && s.brand !== s.name && <span>({s.brand})</span>}
            {s.address && <span className="pre">{s.address}</span>}
            {s.gstin && <span>GSTIN: {s.gstin}</span>}
            {s.fssai && <span>FSSAI Lic. No.: {s.fssai}</span>}
            {s.email && <span>{s.email}</span>}
            {s.phone && <span>{s.phone}</span>}
          </div>
        </header>

        <section className="invoice-parties">
          <div>
            <h3>Bill to / Ship to</h3>
            <strong>{inv.buyer.name}</strong>
            <span>{inv.buyer.address}</span>
            <span>{inv.buyer.city}, {inv.buyer.state} - {inv.buyer.pin}</span>
            <span>{inv.buyer.phone} · {inv.buyer.email}</span>
          </div>
          <div>
            <h3>Place of supply</h3>
            <span>{inv.buyer.state}</span>
          </div>
        </section>

        <div className="invoice-table-wrap">
          <table className="invoice-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                {hasTax && <th>HSN</th>}
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                {hasTax && <th className="num">Taxable value</th>}
                {hasTax && (inv.intraState ? <><th className="num">CGST</th><th className="num">SGST</th></> : <th className="num">IGST</th>)}
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{l.name}{l.option ? ` (${l.option})` : ''}</td>
                  {hasTax && <td>{l.hsn || '-'}</td>}
                  <td className="num">{l.qty}</td>
                  <td className="num">{money(l.unitPrice)}</td>
                  {hasTax && <td className="num">{money(l.taxable)}</td>}
                  {hasTax && (inv.intraState
                    ? <><td className="num">{money(l.cgst)}<small> @{l.taxRate / 2}%</small></td><td className="num">{money(l.sgst)}<small> @{l.taxRate / 2}%</small></td></>
                    : <td className="num">{money(l.igst)}<small> @{l.taxRate}%</small></td>)}
                  <td className="num">{money(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="invoice-totals">
          <div><span>Subtotal</span><strong>{money(inv.subtotal)}</strong></div>
          {inv.discount > 0 && <div><span>Discount{inv.discountCode ? ` (${inv.discountCode})` : ''}</span><strong>-{money(inv.discount)}</strong></div>}
          <div><span>Delivery</span><strong>{inv.delivery ? money(inv.delivery) : 'Free'}</strong></div>
          {hasTax && !inv.taxInclusive && <div><span>GST</span><strong>{money(inv.tax)}</strong></div>}
          <div className="grand"><span>Total</span><strong>{money(inv.total)}</strong></div>
          {hasTax && (
            <p className="invoice-taxnote">
              {inv.taxInclusive ? 'Prices include GST. ' : ''}Taxable value {money(totals.taxable)}
              {inv.intraState ? ` · CGST ${money(totals.cgst)} · SGST ${money(totals.sgst)}` : ` · IGST ${money(totals.igst)}`}
            </p>
          )}
        </section>

        <footer className="invoice-foot">
          <p>This is a computer-generated invoice and does not need a signature.</p>
          {inv.status === 'cancelled' && <p><strong>This order was cancelled{inv.paymentStatus === 'refunded' ? ' and refunded' : ''}.</strong></p>}
        </footer>
      </article>
    </main>
  );
}
