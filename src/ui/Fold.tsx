import { ChevronDown, ChevronRight } from "lucide-react";
import { ReactNode, useState } from "react";
import { Row } from "./kit";

/** a row that opens its content below on a tap */
export function Fold({ title, sub, icon, children, open: initiallyOpen = false }: { title: ReactNode; sub?: ReactNode; icon?: ReactNode; children: ReactNode; open?: boolean }) {
    const [open, setOpen] = useState(initiallyOpen);
    return (
        <>
            <Row icon={icon} title={title} sub={sub} right={open ? <ChevronDown size={18} /> : <ChevronRight size={18} />} onClick={() => setOpen(!open)} chevron={false} />
            {open && <div className="fold-body">{children}</div>}
        </>
    );
}
