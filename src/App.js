import { useState, useEffect } from "react";
import { BrowserProvider, Contract, parseUnits, formatUnits } from "ethers";
import 'bootstrap/dist/css/bootstrap.min.css';

// Environment Variables
const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS;
const USDT_ADDRESS = process.env.REACT_APP_USDT_ADDRESS;
const CHAIN_ID = parseInt(process.env.REACT_APP_CHAIN_ID);
const NETWORK_NAME = process.env.REACT_APP_NETWORK_NAME;
const RPC_URL = process.env.REACT_APP_RPC_URL;
const EXPLORER_URL = process.env.REACT_APP_EXPLORER_URL;
const CURRENCY_NAME = process.env.REACT_APP_CURRENCY_NAME;
const CURRENCY_SYMBOL = process.env.REACT_APP_CURRENCY_SYMBOL;
const APP_NAME = process.env.REACT_APP_APP_NAME;
 
const ABI = [
  "function register(address _referrer) external",
  "function upgrade() external",
  "function withdraw() external",
  "function getMyDetails() view returns (uint256 id, address wallet, uint256 referrerId, uint256[] uplines, uint8 level, uint256 balance, bool exists)"
];

const USDT_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)"
];

export default function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [signer, setSigner] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check if environment variables are loaded
  useEffect(() => {
    if (!CONTRACT_ADDRESS || !USDT_ADDRESS) {
      setError('Missing environment configuration. Please check your .env file.');
    }
  }, []);

  const connectWallet = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if MetaMask or other wallet is available
      if (typeof window.ethereum !== 'undefined') {
        // Use standard Web3 wallet connection (works with SafePal, MetaMask, etc.)
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();

        // Check if we're on the correct network
        const network = await provider.getNetwork();
        if (Number(network.chainId) !== CHAIN_ID) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
            });
          } catch (switchError) {
            // If network doesn't exist, add it
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${CHAIN_ID.toString(16)}`,
                  chainName: NETWORK_NAME,
                  nativeCurrency: {
                    name: CURRENCY_NAME,
                    symbol: CURRENCY_SYMBOL,
                    decimals: 18
                  },
                  rpcUrls: [RPC_URL],
                  blockExplorerUrls: [EXPLORER_URL]
                }]
              });
            }
          }
        }

        const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);

        setAccount(address);
        setContract(contract);
        setSigner(signer);
        await loadUser(contract);
      } else {
        throw new Error('No Web3 wallet detected. Please install SafePal, MetaMask, or another Web3 wallet.');
      }
    } catch (err) {
      console.error('Connection error:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  const loadUser = async (contractInstance) => {
    try {
      const u = await contractInstance.getMyDetails();
      setUser({
        id: u[0].toString(),
        level: u[4],
        balance: formatUnits(u[5], 18)
      });
    } catch (err) {
      console.log("User not registered yet", err);
      setUser(null);
    }
  };

  const approveUSDT = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!signer) {
        throw new Error('Wallet not connected');
      }

      const usdt = new Contract(USDT_ADDRESS, USDT_ABI, signer);
      const amount = parseUnits("1000", 18); // Approve 1000 USDT for multiple transactions
      const tx = await usdt.approve(CONTRACT_ADDRESS, amount);
      await tx.wait();
      alert("USDT Approved successfully!");
    } catch (err) {
      console.error('Approve error:', err);
      setError(err.message || 'Failed to approve USDT');
    } finally {
      setLoading(false);
    }
  };

  const register = async () => {
    try {
      setLoading(true);
      setError(null);

      const referrer = prompt("Enter referrer address (or press Cancel for zero address):");
      const referrerAddress = referrer || "0x0000000000000000000000000000000000000000";
      
      if (!contract) {
        throw new Error('Contract not initialized');
      }

      const tx = await contract.register(referrerAddress);
      await tx.wait();
      alert("Registered successfully!");
      await loadUser(contract);
    } catch (err) {
      console.error('Register error:', err);
      setError(err.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  const upgrade = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!contract) {
        throw new Error('Contract not initialized');
      }

      const tx = await contract.upgrade();
      await tx.wait();
      alert("Upgrade successful!");
      await loadUser(contract);
    } catch (err) {
      console.error('Upgrade error:', err);
      setError(err.message || 'Failed to upgrade');
    } finally {
      setLoading(false);
    }
  };

  const withdraw = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!contract) {
        throw new Error('Contract not initialized');
      }

      const tx = await contract.withdraw();
      await tx.wait();
      alert("Withdraw successful!");
      await loadUser(contract);
    } catch (err) {
      console.error('Withdraw error:', err);
      setError(err.message || 'Failed to withdraw');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100" style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-md-6 col-lg-4">
            <div className="card shadow-lg border-0">
              <div className="card-body p-4">
                <div className="text-center mb-4">
                  <h2 className="card-title fw-bold text-primary mb-2">
                    🛠 {APP_NAME || 'BlockVerse'}
                  </h2>
                  <p className="text-muted small">
                    Compatible with SafePal, MetaMask & other Web3 wallets
                  </p>
                  <small className="text-muted">
                    Network: {NETWORK_NAME} | Chain ID: {CHAIN_ID}
                  </small>
                </div>

                {error && (
                  <div className="alert alert-danger" role="alert">
                    <strong>Error:</strong> {error}
                    {error.includes('environment') && (
                      <div className="mt-2">
                        <small>
                          Make sure your .env file contains:<br/>
                          - REACT_APP_CONTRACT_ADDRESS<br/>
                          - REACT_APP_USDT_ADDRESS<br/>
                          - REACT_APP_CHAIN_ID
                        </small>
                      </div>
                    )}
                  </div>
                )}

                {!account ? (
                  <button 
                    onClick={connectWallet}
                    disabled={loading}
                    className="btn btn-primary btn-lg w-100"
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Connecting...
                      </>
                    ) : 'Connect Wallet'}
                  </button>
                ) : (
                  <div>
                      <div className="card bg-light mb-3">
                        <div className="card-body p-3">
                          <p className="card-text small text-muted mb-1">Connected Account:</p>
                          <p className="card-text font-monospace small text-break">{account}</p>
                          <p className="card-text small text-muted mb-0">
                            Network: {NETWORK_NAME} ({CHAIN_ID})
                          </p>
                        </div>
                      </div>

                    {user ? (
                      <div className="alert alert-success" role="alert">
                        <h6 className="alert-heading fw-bold">User Details:</h6>
                        <p className="mb-1"><strong>ID:</strong> {user.id}</p>
                        <p className="mb-1"><strong>Level:</strong> {user.level}</p>
                        <p className="mb-0"><strong>Balance:</strong> {user.balance} USDT</p>
                      </div>
                    ) : (
                      <div className="alert alert-warning" role="alert">
                        🔔 You are not registered yet.
                      </div>
                    )}

                    <div className="row g-2 mb-3">
                      <div className="col-6">
                        <button 
                          onClick={approveUSDT}
                          disabled={loading}
                          className="btn btn-success w-100"
                        >
                          {loading ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          ) : 'Approve USDT'}
                        </button>
                      </div>
                      
                      <div className="col-6">
                        <button 
                          onClick={register}
                          disabled={loading || user}
                          className="btn btn-primary w-100"
                        >
                          {loading ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          ) : 'Register'}
                        </button>
                      </div>
                      
                      <div className="col-6">
                        <button 
                          onClick={upgrade}
                          disabled={loading || !user}
                          className="btn btn-warning w-100"
                        >
                          {loading ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          ) : 'Upgrade'}
                        </button>
                      </div>
                      
                      <div className="col-6">
                        <button 
                          onClick={withdraw}
                          disabled={loading || !user}
                          className="btn btn-danger w-100"
                        >
                          {loading ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          ) : 'Withdraw'}
                        </button>
                      </div>
                    </div>

                    {loading && (
                      <div className="text-center">
                        <div className="spinner-border text-primary" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                        <p className="text-muted mt-2 small">Processing transaction...</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
