import React from "react";
import { Link } from "react-router-dom";
import { useAccount, inr } from "./useAccount";

const Funds = () => {
  const a = useAccount();
  const live = a.cash != null;
  return (
    <>
      <div className="funds">
        <p>Instant, zero-cost fund transfers with UPI </p>
        <Link className="btn btn-green">Add funds</Link>
        <Link className="btn btn-blue">Withdraw</Link>
      </div>

      <div className="row">
        <div className="col">
          <span>
            <p>Equity</p>
          </span>

          <div className="table">
            <div className="data">
              <p>Available margin</p>
              <p className="imp colored">{live ? inr(a.cash) : "4,043.10"}</p>
            </div>
            <div className="data">
              <p>Used margin</p>
              <p className="imp">{live ? inr(a.margin_used) : "3,757.30"}</p>
            </div>
            <div className="data">
              <p>Available cash</p>
              <p className="imp">{live ? inr(a.cash) : "4,043.10"}</p>
            </div>
            <hr />
            <div className="data">
              <p>Opening Balance</p>
              <p>{live ? inr(a.start) : "4,043.10"}</p>
            </div>
            <div className="data">
              <p>Realised P&L</p>
              <p className={live && a.realized < 0 ? "loss" : "profit"}>{live ? inr(a.realized) : "3736.40"}</p>
            </div>
            <div className="data">
              <p>Unrealised P&L</p>
              <p className={live && a.unrealized < 0 ? "loss" : "profit"}>{live ? inr(a.unrealized) : "4064.00"}</p>
            </div>
            <div className="data">
              <p>Charges (brokerage, STT, GST…)</p>
              <p>{live ? inr(a.fees) : "0.00"}</p>
            </div>
            <div className="data">
              <p>Delivery margin</p>
              <p>0.00</p>
            </div>
            <div className="data">
              <p>Exposure</p>
              <p>0.00</p>
            </div>
            <div className="data">
              <p>Options premium</p>
              <p>0.00</p>
            </div>
            <hr />
            <div className="data">
              <p>Collateral (Liquid funds)</p>
              <p>0.00</p>
            </div>
            <div className="data">
              <p>Collateral (Equity)</p>
              <p>0.00</p>
            </div>
            <div className="data">
              <p>Total Collateral</p>
              <p>0.00</p>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="commodity">
            <p>You don't have a commodity account</p>
            <Link className="btn btn-blue">Open Account</Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Funds;
