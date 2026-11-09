import Link from "next/link";
export function AdminNav(){return <nav aria-label="Административные разделы"><Link href="/admin/users">Ученики и кредиты</Link><Link href="/admin/models">Модели и тарифы</Link><Link href="/admin/access">Доступ и приглашения</Link><Link href="/workspace">Рабочее пространство</Link></nav>}
