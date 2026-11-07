import { useEffect, useState } from 'react';
import MachineList from './MachineList';
import MachineView from './MachineView';

// Hash routes: "#/" (list) and "#/m/<id>" or "#/m/<id>/<sectionId>".
function parseHash() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    return parts[0] === 'm' && parts[1] ? { machine: parts[1], section: parts[2] || null } : { machine: null, section: null };
}

export default function App() {
    const [route, setRoute] = useState(parseHash);

    useEffect(() => {
        const onHash = () => setRoute(parseHash());
        addEventListener('hashchange', onHash);
        return () => removeEventListener('hashchange', onHash);
    }, []);

    return route.machine
        ? <MachineView key={route.machine} id={route.machine} sectionId={route.section} />
        : <MachineList />;
}
