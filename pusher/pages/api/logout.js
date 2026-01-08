export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }
    // Since we're using client-side localStorage, server-side logout 
    // effectively just acknowledges the request. 
    // If you were using HTTP-only cookies, you'd clear them here.
    res.status(200).json({ message: 'Logged out successfully' });
}
