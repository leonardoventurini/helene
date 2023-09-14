import { Link } from 'react-router-dom'

export function Sidebar() {
  return (
    <ul className='menu w-[256px] gap-1.5'>
      <li>
        <Link to='/'>Introduction</Link>
      </li>
      <li>
        <Link to='/server'>Server</Link>
      </li>
      <li>
        <Link to='/client'>Client</Link>
      </li>
      <li>
        <Link to='/authentication'>Authentication</Link>
      </li>
      <li>
        <Link to='/methods'>Methods</Link>
      </li>
      <li>
        <Link to='/events'>Events</Link>
      </li>
      <li>
        <Link to='/channels'>Channels</Link>
      </li>
      <li>
        <Link to='/data'>Data</Link>
      </li>
      <li>
        <Link to='/react-intro'>React</Link>
        <ul className='menu gap-1.5'>
          <li>
            <Link to='/react/provider'>Provider</Link>
          </li>
          <li>
            <Link to='/react/use-client'>useClient Hook</Link>
          </li>
          <li>
            <Link to='/react/use-auth'>useAuth Hook</Link>
          </li>
          <li>
            <Link to='/react/use-local-event'>useLocalEvent Hook</Link>
          </li>
          <li>
            <Link to='/react/use-remote-event'>useRemoteEvent Hook</Link>
          </li>
          <li>
            <Link to='/react/use-connection'>useConnection Hook</Link>
          </li>
          <li>
            <Link to='/react/use-method'>useMethod Hook</Link>
          </li>
          <li>
            <Link to='/react/use-deps-change'>useDepsChange Hook</Link>
          </li>
        </ul>
      </li>
      <li>
        <Link to='/roadmap'>Roadmap</Link>
      </li>
    </ul>
  )
}
