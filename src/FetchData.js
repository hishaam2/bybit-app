import React, { useState, useEffect, useMemo } from 'react';
import cryptoJs from 'crypto-js';
import { useTable, useSortBy } from 'react-table';
import './FetchData.css';

const FetchData = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiKey = 'hyWoVv48s4rKgNgLI4';
    const secretKey = 'zwrQCcsg0MOa0PrtW40aPcURNGEEYa5kbIc5';

    const timeInSeconds = Math.floor(Date.now() / 1000);
    const timestamp = timeInSeconds * 1000;
    const recvWindow = 20000;
    const accountType = 'UNIFIED';
    const signString = `${timestamp}${apiKey}${recvWindow}accountType=${accountType}`;

    const sign = cryptoJs.HmacSHA256(signString, secretKey).toString(cryptoJs.enc.Hex);

    const headers = {
      'X-BAPI-SIGN': sign,
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
    };

    const fetchData = async () => {
      try {
        const response = await fetch('https://api.bybit.com/v5/account/wallet-balance?accountType=UNIFIED', {
          method: 'GET',
          headers: headers,
        });

        if (!response.ok) {
          throw new Error('Network response was not ok');
        }

        const responseBody = await response.json();
        if (responseBody.retCode === 0) {
          const resultList = responseBody.result.list;
          const formattedData = resultList.map(account => 
            account.coin.map(coinData => ({
              coin: coinData.coin,
              walletBalance: coinData.walletBalance,
              usdValue: parseFloat(coinData.usdValue).toFixed(2),
            }))
          ).flat();
          
          setData(formattedData);
        } else {
          console.error('Request failed with retCode:', responseBody.retCode, 'retMsg:', responseBody.retMsg);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const columns = useMemo(
    () => [
      {
        Header: 'Coin Name',
        accessor: 'coin',
      },
      {
        Header: 'Wallet Balance',
        accessor: 'walletBalance',
      },
      {
        Header: 'USD Value',
        accessor: 'usdValue',
      },
    ],
    []
  );

  const tableInstance = useTable({ columns, data }, useSortBy);

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
  } = tableInstance;

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="table-container">
      <h1>Mahreen's ByBit Wallet</h1>
      <table {...getTableProps()} className="styled-table">
        <thead>
          {headerGroups.map(headerGroup => (
            <tr {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map(column => (
                <th {...column.getHeaderProps(column.getSortByToggleProps())}>
                  {column.render('Header')}
                  <span>
                    {column.isSorted
                      ? column.isSortedDesc
                        ? ' 🔽'
                        : ' 🔼'
                      : ''}
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
              <tr {...row.getRowProps()}>
                {row.cells.map(cell => (
                  <td {...cell.getCellProps()}>{cell.render('Cell')}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default FetchData;
