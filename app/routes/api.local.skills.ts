import { data as json, type ActionFunctionArgs } from 'react-router';
import { deleteSkill, listSkills, saveSkill, promoteSkill, RECOMMENDED_SKILLS } from '~/utils/skills.server';
import { rejectCrossOrigin } from '~/utils/local-request.server';

export async function loader({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  return json({ skills: await listSkills(), recommended: RECOMMENDED_SKILLS });
}

export async function action({ request }: ActionFunctionArgs) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const body = await request.json();
    let skills;
    if (body.action === 'delete') {
      skills = await deleteSkill(body.name);
    } else if (body.action === 'promote') {
      await promoteSkill(body.name);
      skills = await listSkills();
    } else if (body.action === 'install-recommended') {
      const recommended = RECOMMENDED_SKILLS.find((item) => item.name === body.name);
      if (!recommended) throw new Error('Recommended skill not found');
      if ((await listSkills()).some((item) => item.name === recommended.name)) {
        skills = await listSkills();
      } else {
        skills = await saveSkill(recommended);
      }
    } else {
      skills = await saveSkill(body.skill);
    }
    return json({ skills });
  } catch (error) { return json({ error: (error as Error).message }, { status: 400 }); }
}
