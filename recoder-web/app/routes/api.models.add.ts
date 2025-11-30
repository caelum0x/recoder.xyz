import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { addCustomModel } from '~/lib/models';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const { providerId, model } = await request.json();

    if (!providerId || !model || !model.name || !model.id) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Add the custom model to the provider
    const success = addCustomModel(providerId, model);

    if (success) {
      return json({ success: true, message: 'Model added successfully' });
    } else {
      return json({ error: 'Failed to add model' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error adding custom model:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
