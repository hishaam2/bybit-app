import React, { useState, useEffect, useMemo, useCallback } from 'react';
import cryptoJs from 'crypto-js';
import { useTable, useSortBy, useExpanded } from 'react-table';
import Papa from 'papaparse';
import './FetchData.css';

const FetchData = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalEquity, setTotalEquity] = useState(0);
  const [lastFetched, setLastFetched] = useState(null);

  const apiKey = 'hyWoVv48s4rKgNgLI4';
  const secretKey = 'zwrQCcsg0MOa0PrtW40aPcURNGEEYa5kbIc5';
  const recvWindow = 20000;

  const generateSignString = (queryParams) => {
    const timestamp = Math.floor(Date.now() / 1000) * 1000;
    const paramString = Object.entries(queryParams)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    return {
      signString: `${timestamp}${apiKey}${recvWindow}${paramString}`,
      timestamp,
    };
  };

  const generateHeaders = (signString, timestamp) => {
    const sign = cryptoJs.HmacSHA256(signString, secretKey).toString(cryptoJs.enc.Hex);
    return {
      'X-BAPI-SIGN': sign,
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
    };
  };

  const fetchTradeHistoryFromCSV = useCallback((coin) => {
    return new Promise((resolve, reject) => {
      Papa.parse(`${process.env.PUBLIC_URL}/data/Bybit-UM-TransactionLog-1707310800-1723039199.csv`, {
        download: true,
        header: true,
        complete: (results) => {
          const tradeHistory = results.data
            .filter(row => row.Currency === coin && row.Direction === 'BUY')
            //.map(row => `${row.Time} | $${row['Filled Price']} (Qty: ${row.Quantity})`)
            .map(row => `${row.Time} | $${parseFloat(row['Filled Price'])} (Qty: ${parseFloat(row.Quantity)})`)
            .join('\n');

          const totalQty = results.data
            .filter(row => row.Currency === coin && row.Direction === 'BUY')
            .reduce((sum, row) => sum + parseFloat(row.Quantity), 0);

          const totalValue = results.data
            .filter(row => row.Currency === coin && row.Direction === 'BUY')
            .reduce((sum, row) => sum + parseFloat(row.Quantity) * parseFloat(row['Filled Price']), 0);

          const avgBuyPrice = totalQty ? (totalValue / totalQty).toFixed(2) : 0;

          resolve({ tradeHistory, avgBuyPrice });
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          reject({ tradeHistory: '', avgBuyPrice: 0 });
        },
      });
    });
  }, []);

  const fetchLivePrice = useCallback(async (coinSymbol) => {
    try {
      const response = await fetch(`https://api.coincap.io/v2/assets`);
      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      const assets = data.data;
      
      const asset = assets.find(asset => asset.symbol === coinSymbol);
      if (!asset) throw new Error(`Asset with symbol ${coinSymbol} not found`);
      
      return parseFloat(asset.priceUsd).toFixed(2);
    } catch (error) {
      console.error('Error fetching live price:', error);
      return null;
    }
  }, []);

  const fetchData = useCallback(async () => {
    const { signString, timestamp } = generateSignString({ accountType: 'UNIFIED' });
    const headers = generateHeaders(signString, timestamp);

    try {
      const response = await fetch('https://api.bybit.com/v5/account/wallet-balance?accountType=UNIFIED', { headers });
      if (!response.ok) throw new Error('Network response was not ok');
      const responseBody = await response.json();
      if (responseBody.retCode === 0) {
        const resultList = responseBody.result.list;
        setTotalEquity(parseFloat(resultList[0].totalEquity).toFixed(2));
        const formattedData = await Promise.all(resultList.flatMap(account =>
          account.coin.map(async coinData => {
            const { tradeHistory, avgBuyPrice } = await fetchTradeHistoryFromCSV(coinData.coin);
            const livePrice = await fetchLivePrice(coinData.coin);
            const pnl = livePrice && avgBuyPrice ? (((livePrice - avgBuyPrice) / avgBuyPrice) * 100).toFixed(2) : 0;
            return {
              coin: coinData.coin,
              walletBalance: coinData.walletBalance,
              usdValue: parseFloat(coinData.usdValue).toFixed(2),
              tradeHistory: tradeHistory,
              avgBuyPrice: avgBuyPrice,
              livePrice: livePrice,
              pnl: pnl,
            };
          })
        ));
        setData(formattedData);
        setLastFetched(new Date().toLocaleString());
      } else {
        console.error('Request failed:', responseBody.retCode, responseBody.retMsg);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  }, [fetchTradeHistoryFromCSV, fetchLivePrice]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns = useMemo(() => [
    {
      Header: '',
      id: 'expander',
      Cell: ({ row }) => (
        <span {...row.getToggleRowExpandedProps()}>
          {row.isExpanded ? '−' : '+'}
        </span>
      ),
    },
    { Header: 'Coin Name', accessor: 'coin' },
    { Header: 'Wallet Balance', accessor: 'walletBalance' },
    { Header: 'USD Value', accessor: 'usdValue' },
    { Header: 'Average Buy Price', accessor: 'avgBuyPrice' },
    { Header: 'Live Price', accessor: 'livePrice' },
    {
      Header: 'PnL',
      accessor: 'pnl',
      Cell: ({ value }) => (
        <span style={{ color: value >= 0 ? 'green' : 'red' }}>
          {value}%
        </span>
      ),
    },
  ], []);

  const tableInstance = useTable({ columns, data }, useSortBy, useExpanded);
  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } = tableInstance;

  return (
    <div className="table-container">
      <h1>Mahreen's ByBit Wallet</h1>
      {loading ? <div>Loading...</div> : (
        <>
          <div>Total USD Value: ${totalEquity}</div>
          <div>Last Fetched: {lastFetched}</div>
          <button onClick={fetchData}>Refresh</button>
          <table {...getTableProps()} className="styled-table">
            <thead>
              {headerGroups.map(headerGroup => (
                <tr {...headerGroup.getHeaderGroupProps()}>
                  {headerGroup.headers.map(column => (
                    <th {...column.getHeaderProps(column.getSortByToggleProps())}>
                      {column.render('Header')}
                      <span>
                        {column.isSorted ? (column.isSortedDesc ? ' 🔽' : ' 🔼') : ''}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody {...getTableBodyProps()}>
              {rows.map(row => {
                prepareRow(row);
                return (
                  <React.Fragment key={row.id}>
                    <tr {...row.getRowProps()}>
                      {row.cells.map(cell => (
                        <td {...cell.getCellProps()}>{cell.render('Cell')}</td>
                      ))}
                    </tr>
                    {row.isExpanded && (
                      <tr>
                        <td colSpan={columns.length} style={{ whiteSpace: 'pre-line' }}>
                          {row.original.tradeHistory}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </>
    )}
    </div>
  );
};

export default FetchData;
