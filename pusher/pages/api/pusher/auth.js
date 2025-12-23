import { pusher } from '../../../lib/pusher';

export default async function handler(req, res) {
  const { socket_id, channel_name, username } = req.body;

  if (channel_name.startsWith('presence-')) {
    const presenceData = {
      user_id: username,
      user_info: { name: username },
    };
    const auth = pusher.authenticate(socket_id, channel_name, presenceData);
    return res.send(auth);
  } else {
    const auth = pusher.authenticate(socket_id, channel_name);
    return res.send(auth);
  }
}
