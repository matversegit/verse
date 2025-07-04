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
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)"
];

export default function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [signer, setSigner] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const [checkingWallet, setCheckingWallet] = useState(true);
  const [deviceType, setDeviceType] = useState('desktop');
  const [walletType, setWalletType] = useState(null);

  // Detect device type and wallet
  const detectDeviceAndWallet = () => {
    const userAgent = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    
    setDeviceType(isMobile ? 'mobile' : 'desktop');

    // Detect specific wallet apps on mobile
    if (isMobile) {
      // Check if we're inside a wallet app's browser
      if (typeof window.ethereum !== 'undefined') {
        // Try to detect specific wallet
        if (window.ethereum.isMetaMask) {
          setWalletType('MetaMask Mobile');
        } else if (window.ethereum.isSafePal) {
          setWalletType('SafePal');
        } else if (window.ethereum.isTrust) {
          setWalletType('Trust Wallet');
        } else if (window.ethereum.isCoinbaseWallet) {
          setWalletType('Coinbase Wallet');
        } else {
          setWalletType('Mobile Wallet');
        }
        return true;
      }
      return false;
    } else {
      // Desktop - check for browser extensions
      if (typeof window.ethereum !== 'undefined') {
        if (window.ethereum.isMetaMask) {
          setWalletType('MetaMask');
        } else if (window.ethereum.isSafePal) {
          setWalletType('SafePal');
        } else {
          setWalletType('Web3 Wallet');
        }
        return true;
      }
      return false;
    }
  };

  // Check wallet availability with mobile-specific logic
  const checkWalletAvailability = () => {
    return new Promise((resolve) => {
      // Check immediately
      if (detectDeviceAndWallet()) {
        resolve(true);
        return;
      }

      // For mobile, don't wait too long as wallet apps either work immediately or not at all
      const maxAttempts = deviceType === 'mobile' ? 20 : 50; // 2 seconds for mobile, 5 for desktop
      let attempts = 0;
      
      const checkInterval = setInterval(() => {
        attempts++;
        if (detectDeviceAndWallet()) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  };

  // Check if environment variables are loaded and wallet availability
  useEffect(() => {
    const initializeApp = async () => {
      // Check environment variables
      if (!CONTRACT_ADDRESS || !USDT_ADDRESS) {
        setError('Missing environment configuration. Please check your .env file.');
        setCheckingWallet(false);
        return;
      }

      // Detect device type first
      detectDeviceAndWallet();

      // Check wallet availability
      const isWalletAvailable = await checkWalletAvailability();
      setWalletAvailable(isWalletAvailable);
      setCheckingWallet(false);

      if (!isWalletAvailable) {
        if (deviceType === 'mobile') {
          setError('Please open this app in a Web3 wallet browser (MetaMask, SafePal, Trust Wallet, etc.) or use WalletConnect.');
        } else {
          setError('No Web3 wallet extension detected. Please install MetaMask, SafePal, or another Web3 wallet extension.');
        }
      }
    };

    initializeApp();
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (typeof window.ethereum !== 'undefined') {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          // User disconnected wallet
          setAccount(null);
          setContract(null);
          setSigner(null);
          setUser(null);
        } else {
          // Account changed, reconnect
          connectWallet();
        }
      };

      const handleChainChanged = (chainId) => {
        // Reload the page when chain changes
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, []);

  const connectWallet = async () => {
    try {
      setLoading(true);
      setError(null);

      // Double-check wallet availability
      if (typeof window.ethereum === 'undefined') {
        if (deviceType === 'mobile') {
          throw new Error('Please open this app in a Web3 wallet browser (MetaMask, SafePal, Trust Wallet, etc.)');
        } else {
          throw new Error('No Web3 wallet extension detected. Please install MetaMask, SafePal, or another Web3 wallet extension.');
        }
      }

      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      if (accounts.length === 0) {
        throw new Error('No accounts found. Please unlock your wallet.');
      }
      
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
          } else {
            throw switchError;
          }
        }
      }

      const contract = new Contract(CONTRACT_ADDRESS, ABI, signer);

      setAccount(address);
      setContract(contract);
      setSigner(signer);
      await loadUser(contract);
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

  const checkUSDTStatus = async () => {
    if (!signer || !account) return;
    
    try {
      const usdt = new Contract(USDT_ADDRESS, USDT_ABI, signer);
      const balance = await usdt.balanceOf(account);
      const allowance = await usdt.allowance(account, CONTRACT_ADDRESS);
      
      console.log('USDT Balance:', formatUnits(balance, 18));
      console.log('USDT Allowance:', formatUnits(allowance, 18));
      
      return {
        balance: formatUnits(balance, 18),
        allowance: formatUnits(allowance, 18)
      };
    } catch (err) {
      console.error('Error checking USDT status:', err);
      return null;
    }
  };

  const register = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check USDT status first
      const usdtStatus = await checkUSDTStatus();
      if (usdtStatus) {
        console.log('USDT Status:', usdtStatus);
        if (parseFloat(usdtStatus.allowance) < 10) { // Assuming registration costs less than 10 USDT
          throw new Error('Insufficient USDT allowance. Please approve USDT first (need at least 10 USDT allowance)');
        }
        if (parseFloat(usdtStatus.balance) < 10) { // Assuming registration costs less than 10 USDT
          throw new Error('Insufficient USDT balance. You need at least 10 USDT to register');
        }
      }

      const referrer = prompt("Enter referrer address (or press Cancel for zero address):");
      const referrerAddress = referrer || "0x0000000000000000000000000000000000000000";
      
      if (!contract) {
        throw new Error('Contract not initialized');
      }

      // Validate referrer address format
      if (referrerAddress !== "0x0000000000000000000000000000000000000000" && 
          !/^0x[a-fA-F0-9]{40}$/.test(referrerAddress)) {
        throw new Error('Invalid referrer address format');
      }

      console.log('Attempting to register with referrer:', referrerAddress);
      
      // Try to estimate gas first to get a clearer error
      try {
        const gasEstimate = await contract.register.estimateGas(referrerAddress);
        console.log('Gas estimate successful:', gasEstimate.toString());
      } catch (gasError) {
        console.error('Gas estimation failed:', gasError);
        
        // Try to get more specific error information
        if (gasError.message.includes('already registered')) {
          throw new Error('You are already registered');
        } else if (gasError.message.includes('allowance')) {
          throw new Error('Insufficient USDT allowance. Please approve USDT first');
        } else if (gasError.message.includes('balance')) {
          throw new Error('Insufficient USDT balance');
        } else if (gasError.message.includes('referrer')) {
          throw new Error('Invalid referrer address or referrer not registered');
        } else {
          throw new Error(`Registration failed: ${gasError.message || 'Unknown contract error'}`);
        }
      }

      const tx = await contract.register(referrerAddress);
      console.log('Transaction sent:', tx.hash);
      
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);
      
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

  // Generate deep links for mobile wallets
  const generateDeepLinks = () => {
    const currentUrl = encodeURIComponent(window.location.href);
    
    return {
      metamask: `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`,
      safepal: `safepal://wc?uri=${currentUrl}`,
      trust: `trust://wc?uri=${currentUrl}`,
      coinbase: `https://go.cb-w.com/dapp?cb_url=${currentUrl}`,
    };
  };

  const getMobileWalletOptions = () => {
    const deepLinks = generateDeepLinks();
    
    return (
      <div className="mt-3">
        <p className="text-muted small mb-3">
          <strong>Option 1:</strong> Open this app in a wallet browser
        </p>
        <div className="d-grid gap-2">
          <a 
            href={deepLinks.metamask} 
            className="btn btn-outline-primary btn-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            📱 Open in MetaMask
          </a>
          <a 
            href={deepLinks.safepal} 
            className="btn btn-outline-primary btn-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            📱 Open in SafePal Browser
          </a>
          <a 
            href={deepLinks.trust} 
            className="btn btn-outline-primary btn-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            📱 Open in Trust Wallet
          </a>
          <a 
            href={deepLinks.coinbase} 
            className="btn btn-outline-primary btn-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            📱 Open in Coinbase Wallet
          </a>
        </div>
        
        <p className="text-muted small mt-3 mb-2">
          <strong>Option 2:</strong> Don't have a wallet? Download one:
        </p>
        <div className="d-flex gap-2 flex-wrap">
          <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary btn-sm">
            Get MetaMask
          </a>
          <a href="https://www.safepal.io/" target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary btn-sm">
            Get SafePal
          </a>
          <a href="https://trustwallet.com/" target="_blank" rel="noopener noreferrer" className="btn btn-outline-secondary btn-sm">
            Get Trust Wallet
          </a>
        </div>
        
        <div className="alert alert-info mt-3" role="alert">
          <small>
            💡 <strong>Tip:</strong> Copy this URL and paste it in your wallet app's browser, or use the "Open in..." buttons above.
          </small>
        </div>
      </div>
    );
  };

  const getDesktopWalletOptions = () => {
    return (
      <div className="mt-3">
        <p className="text-muted small mb-2">Install a browser extension:</p>
        <div className="d-flex gap-2 flex-wrap">
          <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="btn btn-outline-primary btn-sm">
            Install MetaMask
          </a>
          <a href="https://www.safepal.io/" target="_blank" rel="noopener noreferrer" className="btn btn-outline-primary btn-sm">
            Install SafePal
          </a>
        </div>
        <div className="alert alert-info mt-3" role="alert">
          <small>
            💡 After installing, refresh this page and click "Connect Wallet"
          </small>
        </div>
      </div>
    );
  };

  const copyUrlToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('URL copied to clipboard! Paste it in your wallet app browser.');
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('URL copied to clipboard! Paste it in your wallet app browser.');
    }
  };

  if (checkingWallet) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>
        <div className="text-center text-white">
          <div className="spinner-border text-light mb-3" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p>Detecting {deviceType === 'mobile' ? 'wallet app' : 'Web3 wallet'}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100" style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-md-6 col-lg-4">
            <div className="card shadow-lg border-0">
              <div className="card-body p-4">
                <div className="text-center mb-4">
                  <h2 className="card-title fw-bold text-primary mb-2">
                    🛠 {APP_NAME || 'Community Builder dApp'}
                  </h2>
                  <p className="text-muted small">
                    {deviceType === 'mobile' ? 'Mobile Wallet Compatible' : 'Web3 Browser Extension Compatible'}
                  </p>
                  <small className="text-muted">
                    Network: {NETWORK_NAME} | Chain ID: {CHAIN_ID}
                  </small>
                  {walletType && (
                    <div className="badge bg-success mt-2">
                      Connected via {walletType}
                    </div>
                  )}
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

                {!walletAvailable ? (
                  <div className="text-center">
                    <div className="alert alert-warning" role="alert">
                      <h6 className="alert-heading">
                        {deviceType === 'mobile' ? '📱 Mobile Wallet Required' : '🌐 Web3 Wallet Extension Required'}
                      </h6>
                      <p className="mb-0">
                        {deviceType === 'mobile' 
                          ? 'Please use a Web3 wallet app to access this dApp.'
                          : 'Please install a Web3 wallet extension to use this application.'
                        }
                      </p>
                    </div>
                    
                    {deviceType === 'mobile' ? getMobileWalletOptions() : getDesktopWalletOptions()}
                    
                    {deviceType === 'mobile' && (
                      <button 
                        onClick={copyUrlToClipboard}
                        className="btn btn-info mt-3"
                      >
                        📋 Copy App URL
                      </button>
                    )}
                    
                    <button 
                      onClick={() => window.location.reload()}
                      className="btn btn-outline-primary mt-3 ms-2"
                    >
                      🔄 Refresh Page
                    </button>
                  </div>
                ) : !account ? (
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
                    ) : `Connect ${walletType || 'Wallet'}`}
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
                          {walletType && (
                            <p className="card-text small text-success mb-0">
                              Via: {walletType}
                            </p>
                          )}
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
                      
                      <div className="col-12">
                        <button 
                          onClick={async () => {
                            const status = await checkUSDTStatus();
                            if (status) {
                              alert(`USDT Balance: ${status.balance}\nUSDT Allowance: ${status.allowance}`);
                            } else {
                              alert('Could not fetch USDT status');
                            }
                          }}
                          disabled={loading}
                          className="btn btn-info w-100 btn-sm"
                        >
                          🔍 Check USDT Status
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
