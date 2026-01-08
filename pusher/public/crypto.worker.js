// public/crypto.worker.js
importScripts('https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js');

async function deriveKey(password) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(password));
  return await crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function decryptV2(data, password) {
  try {
    const parts = data.split(':');
    if (parts.length !== 4) return '[Decryption Failed]';
    
    const iv = new Uint8Array(parts[1].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const encrypted = new Uint8Array(parts[2].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const tag = new Uint8Array(parts[3].match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    // Combine encrypted data and tag for SubtleCrypto
    const combined = new Uint8Array(encrypted.length + tag.length);
    combined.set(encrypted);
    combined.set(tag, encrypted.length);
    
    const key = await deriveKey(password);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      combined
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error('V2 Decrypt Error:', e);
    return '[Decryption Failed]';
  }
}

async function encryptV2(data, password) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(data)
  );
  
  const combined = new Uint8Array(encrypted);
  const ciphertext = combined.slice(0, combined.length - 16);
  const tag = combined.slice(combined.length - 16);
  
  const toHex = (buf) => Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `v2:${toHex(iv)}:${toHex(ciphertext)}:${toHex(tag)}`;
}

self.onmessage = async function(e) {
  const { id, action, payload } = e.data;
  const { data, key } = payload;

  try {
    if (action === 'decrypt') {
      if (!data) {
        self.postMessage({ id, success: true, result: '' });
        return;
      }
      
      let result = '';
      if (data.startsWith('v2:')) {
        result = await decryptV2(data, key);
      } else {
        const bytes = CryptoJS.AES.decrypt(data, key);
        result = bytes.toString(CryptoJS.enc.Utf8);
        if (!result || result.length === 0) result = '[Decryption Failed]';
      }
      
      self.postMessage({ id, success: true, result });
    } else if (action === 'encrypt') {
      // Defaulting all new encryption to V2 for performance
      const result = await encryptV2(data, key);
      self.postMessage({ id, success: true, result });
    }
  } catch (error) {
    self.postMessage({ id, success: false, error: error.message, result: '[Decryption Failed]' });
  }
};
