import { data as json, type LoaderFunctionArgs } from 'react-router';
import { providerRegistry } from '~/llm/registry';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const providers = providerRegistry.getAllProviders();
    const models = await providerRegistry.getAllModels();
    return json({ providers, models });
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
}
