import Studio from '@/components/Studio';
export default function Page({ params }: { params: { id: string } }) { return <Studio id={params.id} />; }
