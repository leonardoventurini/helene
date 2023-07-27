import { Link } from 'react-router-dom'

export function Sidebar() {
  return (
    <ul className='menu w-56'>
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
        <ul>
          <li>
            <Link to='/react/provider'>Provider Hook</Link>
          </li>
          <li>
            <Link to='/react/useClient'>useClient Hook</Link>
          </li>
          <li>
            <Link to='/react/useAuth'>useAuth Hook</Link>
          </li>
          <li>
            <Link to='/react/useEvent'>useEvent Hook</Link>
          </li>
          <li>
            <Link to='/react/useConnection'>useConnection Hook</Link>
          </li>
          <li>
            <Link to='/react/UseMethod'>UseMethod Hook</Link>
          </li>
          <li>
            <Link to='/react/useDepsChange'>useDepsChange Hook</Link>
          </li>
        </ul>
      </li>
      <li>
        <Link to='/roadmap'>Roadmap</Link>
      </li>
      <li>
        <Link to='/license'>License</Link>
      </li>
    </ul>
  )
}
